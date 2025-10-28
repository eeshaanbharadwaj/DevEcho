// devecho/frontend/src/App.jsx

import React from 'react';
import { debounce } from './utils/debounce';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import { useState, useEffect, useCallback, useRef } from 'react';

// --- Setup Socket Connection ---
const socket = io('http://localhost:3001'); 

const EditorPage = () => {
    const { roomId } = useParams();
    const [code, setCode] = useState('// Waiting for server to load code...');
    const [aiSuggestion, setAiSuggestion] = useState('AI Mentor is listening...'); // <-- NEW STATE
    const [summaryResult, setSummaryResult] = useState(''); // <--- NEW STATE
    const [isGenerating, setIsGenerating] = useState(false); // <--- NEW STATE
    const [status, setStatus] = useState('Connecting...');
    const editorRef = useRef(null);
    const codeUpdateSource = useRef(''); // Tracks who triggered the change

    const username = localStorage.getItem('username') || `User-${Math.floor(Math.random() * 1000)}`;

    // Define the debounced function for the AI call (3 seconds delay)
    const requestSuggestionDebounced = useCallback(
        debounce((currentCode) => {
            if (currentCode.trim().length > 20) { // Only request if there's substantial code
                setAiSuggestion('AI Mentor thinking...');
                socket.emit('request-suggestion', roomId, currentCode);
            }
        }, 3000), // 3000ms = 3 seconds delay
        [roomId]
    );

    // 1. Monaco Editor Setup
    const handleEditorDidMount = (editor, monaco) => {
        editorRef.current = editor;
        // monaco.editor.setTheme('vs-dark');
    };

    // 2. Handle Local Code Change (updated to include the debounced AI call)
    const handleCodeChange = useCallback((value) => {
        setCode(value);
        
        // Prevent sending change back to the server if the change came from the server
        if (codeUpdateSource.current === 'remote') {
            codeUpdateSource.current = ''; // Reset flag
            return;
        }

        // Emit the change to the server for broadcasting
        socket.emit('code-change', roomId, value);
        
        // Trigger the debounced AI request
        requestSuggestionDebounced(value);
    }, [roomId, requestSuggestionDebounced]);
    
    // --- NEW: SUMMARY HANDLER ---
    const handleGenerateSummary = () => {
        setIsGenerating(true);
        setSummaryResult('Generating final session summary...');
        socket.emit('request-summary', roomId);
    };
    
    // 3. Socket.io Event Listeners (runs once on component mount)
    useEffect(() => {
        // Join the room as soon as the component mounts
        socket.emit('join-room', roomId, username);

        // Receive initial code from server
        socket.on('load-code', (initialCode) => {
            setCode(initialCode);
            setStatus('Ready to collaborate!');
        });
        
        // Receive synchronized code from other users
        socket.on('code-sync', (newCode) => {
            // Set flag to prevent local onChange from triggering a re-broadcast
            codeUpdateSource.current = 'remote'; 
            
            // This updates the Monaco Editor instance directly
            if (editorRef.current) {
                editorRef.current.setValue(newCode);
            }
        });

        // Receive user join notifications
        socket.on('user-joined', (message) => {
            alert(message);
        });

        // Listen for AI suggestions
        socket.on('ai-suggestion', (suggestion) => {
            setAiSuggestion(suggestion);
        });

        // --- NEW: SUMMARY RESULT LISTENER ---
        socket.on('session-summary-result', (result) => {
            setSummaryResult(result);
            setIsGenerating(false);
        });

        // Cleanup on unmount
        return () => {
            socket.off('load-code');
            socket.off('code-sync');
            socket.off('user-joined');
            socket.off('ai-suggestion');
            socket.off('session-summary-result'); // <--- NEW CLEANUP
            // socket.emit('leave-room', roomId);
        };
    }, [roomId, username]);

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px', background: '#333', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                    Room: **{roomId}** | User: **{username}** | Status: {status}
                </div>
                <div style={{ fontWeight: 'bold', color: '#61dafb', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    🤖 Mentor: {aiSuggestion}
                </div>
                <button 
                    onClick={handleGenerateSummary} 
                    disabled={isGenerating}
                    style={{ padding: '5px 10px', cursor: isGenerating ? 'not-allowed' : 'pointer', background: isGenerating ? '#555' : '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
                >
                    {isGenerating ? 'Summarizing...' : 'Generate Session Summary 📝'}
                </button>
            </div>

            {/* NEW: Summary Display Area */}
            {summaryResult && (
                <div style={{ padding: '10px', background: '#444', color: 'white', whiteSpace: 'pre-wrap', borderBottom: '2px solid #555' }}>
                    <strong>Session Report:</strong> {summaryResult}
                </div>
            )}
            
            <div style={{ flexGrow: 1 }}>
                <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    theme="vs-dark"
                    value={code}
                    onMount={handleEditorDidMount}
                    onChange={handleCodeChange}
                    options={{
                        minimap: { enabled: false },
                        padding: { top: 10 }
                    }}
                />
            </div>
        </div>
    );
};

// --- Home Component (Entry Point to create/join rooms) ---
const Home = () => {
    const [inputRoomId, setInputRoomId] = useState('');
    const navigate = useNavigate();

    const handleJoin = () => {
        if (inputRoomId.trim()) {
            navigate(`/room/${inputRoomId.trim()}`);
        }
    };
    
    const handleCreate = () => {
        const newRoomId = Math.random().toString(36).substring(2, 9);
        navigate(`/room/${newRoomId}`);
    };

    return (
        <div style={{ padding: '50px', maxWidth: '400px', margin: 'auto', textAlign: 'center' }}>
            <h2>Welcome to DevEcho 🚀</h2>
            <button onClick={handleCreate} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', marginBottom: '20px' }}>
                Create New Session
            </button>
            <hr />
            <h3>or Join Existing Session</h3>
            <input
                type="text"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value)}
                placeholder="Enter Room ID"
                style={{ padding: '10px', width: '100%', marginBottom: '10px' }}
            />
            <button onClick={handleJoin} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
                Join Room
            </button>
        </div>
    );
};

// --- Router Setup ---
function App() {
    useEffect(() => {
        if (!localStorage.getItem('username')) {
            localStorage.setItem('username', `User-${Math.floor(Math.random() * 1000)}`);
        }
    }, []);

    return (
        <Router>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/room/:roomId" element={<EditorPage />} />
            </Routes>
        </Router>
    );
}

export default App;