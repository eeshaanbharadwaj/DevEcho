// devecho/backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios'); // <--- NEW REQUIRE for code execution
const mongoose = require('mongoose');
const CodeSession = require('./models/CodeSession');
const activeUsers={};

require('dotenv').config(); 
const { GoogleGenAI } = require('@google/genai');

// Initialize the AI client using the environment variable
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
const httpServer = http.createServer(app);

const PORT = 3001; 

// Piston API Details (Public endpoint, no API key needed for basic use)
const PISTON_API_URL = 'https://emkc.org/api/v2/piston/execute';

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));
// --------------------------

// Configure CORS for the frontend running on port 5173
app.use(cors({
    origin: "http://localhost:5173"
}));

// Setup Socket.io Server
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

// Socket.io Connection Logic
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- 1. UPDATED JOIN ROOM EVENT ---
    socket.on('join-room', async (roomId, username) => {
        socket.join(roomId);
        socket.data.username = username; // Store username on the socket object
        socket.data.roomId = roomId;     // Store room ID on the socket object
        console.log(`${username} joined room: ${roomId}`);

        // Add user to the activeUsers list for this room
        if (!activeUsers[roomId]) {
            activeUsers[roomId] = {};
        }
        activeUsers[roomId][socket.id] = username;

        // Use findOneAndUpdate with upsert to avoid race condition
        // This will either find the existing session or create a new one atomically
        let session = await CodeSession.findOneAndUpdate(
            { roomId },
            { $setOnInsert: {} }, // Empty $setOnInsert, will use schema defaults
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Send the current code state to the joining user
        socket.emit('load-code', session.code);

        // Broadcast a status message to others in the room
        socket.to(roomId).emit('user-joined', `${username} joined the session!`);
        
        // BROADCAST UPDATED USER LIST TO ALL IN ROOM
        if (activeUsers[roomId]) {
            io.to(roomId).emit('user-list-update', Object.values(activeUsers[roomId]));
        }
    });

    // --- LEAVE ROOM EVENT HANDLER ---
    socket.on('leave-room', (roomId) => {
        if (activeUsers[roomId]) {
            // Remove the user from the activeUsers list
            delete activeUsers[roomId][socket.id];
            
            // Check if room still has users before broadcasting
            const remainingUsers = Object.keys(activeUsers[roomId]);
            
            if (remainingUsers.length === 0) {
                // Room is now empty, clean it up
                delete activeUsers[roomId];
            } else {
                // Broadcast the updated list to remaining users
                io.to(roomId).emit('user-list-update', Object.values(activeUsers[roomId]));
            }
        }
        
        // Leave the room
        socket.leave(roomId);
        console.log(`${socket.data.username || 'User'} left room: ${roomId}`);
    });

    // --- 2. UPDATED CODE CHANGE EVENT ---
    socket.on('code-change', async (roomId, newCode) => {
        // Update the database state with the latest code
        await CodeSession.updateOne({ roomId }, { code: newCode });

        // Broadcast the change to ALL OTHER clients in the room
        socket.to(roomId).emit('code-sync', newCode);
    });

    // --- AI SUGGESTION REQUEST HANDLER (Fixed bugs) ---
    socket.on('request-suggestion', async (roomId, currentCode) => {
        console.log(`AI Mentor requested for room ${roomId}`);
        
        try {
            const prompt = `You are a senior developer mentor observing a real-time coding session. Review the following JavaScript code snippet for efficiency, potential bugs, or best practices. 
            
Code:\n\n\`\`\`javascript\n${currentCode}\n\`\`\`\n\nProvide one concise, actionable suggestion that is not a trivial syntax fix. If the code is perfect or too simple, suggest a next feature to implement. Respond with only the suggestion text, nothing else.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            // --- NEW, ROBUST CHECK ---
            const suggestion = response.text; // Access the text directly
            
            if (!suggestion) {
                // If the key is there but the text is empty (e.g., due to safety filter)
                throw new Error("API response text was empty or filtered.");
            }
            
            io.to(roomId).emit('ai-suggestion', suggestion.trim());

        } catch (error) {
            console.error("Gemini API Error:", error);
            // Send a specific error message for debugging
            io.to(roomId).emit('ai-suggestion', `Mentor Error: ${error.message || 'Check API Key/Quota.'}`);
        }
    });

    // --- NEW: SESSION SUMMARY HANDLER ---
    socket.on('request-summary', async (roomId) => {
        console.log(`AI Summary requested for room ${roomId}`);
        
        try {
            const session = await CodeSession.findOne({ roomId });
            if (!session) {
                io.to(roomId).emit('session-summary-result', 'Error: Session not found.');
                return;
            }

            // The key AI prompt for the unique feature
            const prompt = `You are a technical documentarian. Generate a concise, professional summary for this collaborative coding session. 
            Focus on the final code state and potential next steps based on the code provided. The code is:
            
            \n\n\`\`\`javascript\n${session.code}\n\`\`\`\n\nGenerate a summary suitable for a project report. Start with 'Session Summary:'`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            // --- NEW, ROBUST CHECK ---
            const summary = response.text; // Access the text directly
            
            if (!summary) {
                // If the key is there but the text is empty (e.g., due to safety filter)
                throw new Error("API response text was empty or filtered.");
            }
            
            const trimmedSummary = summary.trim();
            
            // Save the generated summary to the database
            await CodeSession.updateOne({ roomId }, { summary: trimmedSummary });

            // Emit the summary back to the room
            io.to(roomId).emit('session-summary-result', trimmedSummary);

        } catch (error) {
            console.error("Summary API Error:", error);
            // Send a specific error message for debugging
            io.to(roomId).emit('session-summary-result', `Summary Error: ${error.message || 'Check API Key/Quota.'}`);
        }
    });

    // --- NEW: CODE EXECUTION HANDLER ---
    socket.on('execute-code', async (roomId, code, language) => {
        console.log(`Executing ${language} code for room ${roomId}`);
        
        try {
            // 1. Prepare the payload for the Piston API
            const payload = {
                language: language,
                version: '*', // Use the latest version available on Piston
                files: [{ content: code }]
                // You can add 'stdin' for user input here if implemented
            };

            // 2. Make the HTTP request to the Piston execution API
            const response = await axios.post(PISTON_API_URL, payload);
            
            const result = response.data;
            
            // Piston API response structure check:
            if (result.run && result.run.output) {
                // Success: Get output or error message from stderr/stdout
                let output = result.run.output;

                // 3. Broadcast the output back to the entire room
                io.to(roomId).emit('code-output', {
                    success: true,
                    output: output,
                    language: language
                });
            } else {
                // API call succeeded but execution failed (e.g., syntax error)
                throw new Error(result.message || 'Unknown execution error occurred.');
            }

        } catch (error) {
            console.error("Code Runner Error:", error.message);
            // Broadcast an error message back to the entire room
            io.to(roomId).emit('code-output', {
                success: false,
                output: `Execution Failed: ${error.message || 'Check network or API status.'}`,
                language: language
            });
        }
    });

    // --- NEW: CHAT MESSAGE HANDLER ---
    socket.on('send-message', (roomId, message) => {
        const username = socket.data.username || 'Anonymous';
        const messagePayload = {
            text: message,
            user: username,
            timestamp: new Date().toLocaleTimeString(),
            id: Date.now()
        };
        // Send the message to ALL clients in the room, including the sender
        io.to(roomId).emit('receive-message', messagePayload);
    });

    // --- UPDATED DISCONNECT EVENT ---
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const roomId = socket.data.roomId;
        
        if (roomId && activeUsers[roomId]) {
            // Remove the user from the activeUsers list
            delete activeUsers[roomId][socket.id];
            
            // Check if room still has users before broadcasting
            const remainingUsers = Object.keys(activeUsers[roomId]);
            
            if (remainingUsers.length === 0) {
                // Room is now empty, clean it up
                delete activeUsers[roomId];
            } else {
                // Broadcast the updated list to remaining users
                io.to(roomId).emit('user-list-update', Object.values(activeUsers[roomId]));
            }
        }
    });
});

// Start the Server
httpServer.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));