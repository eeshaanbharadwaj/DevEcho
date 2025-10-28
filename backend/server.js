// devecho/backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose'); // <--- NEW REQUIRE
const CodeSession = require('./models/CodeSession'); // <--- NEW REQUIRE

require('dotenv').config(); 
const { GoogleGenAI } = require('@google/genai');

// Initialize the AI client using the environment variable
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
const httpServer = http.createServer(app);

const PORT = 3001; 

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
    socket.on('join-room', async (roomId, username) => { // <--- Added async
        socket.join(roomId);
        console.log(`${username} joined room: ${roomId}`);

        let session = await CodeSession.findOne({ roomId });

        // If no session exists, create a new one
        if (!session) {
            session = await CodeSession.create({ roomId });
        }

        // Send the current code state to the joining user
        socket.emit('load-code', session.code);

        // Broadcast a status message to others in the room
        socket.to(roomId).emit('user-joined', `${username} joined the session!`);
    });

    // --- 2. UPDATED CODE CHANGE EVENT ---
    socket.on('code-change', async (roomId, newCode) => { // <--- Added async
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

    // --- 3. UPDATED DISCONNECT EVENT ---
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// Start the Server
httpServer.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));