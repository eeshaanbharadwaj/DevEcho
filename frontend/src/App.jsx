// devecho/frontend/src/App.jsx

import React from 'react';
import './App.css';
import { debounce } from './utils/debounce';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import { useState, useEffect, useCallback, useRef } from 'react';

// --- Setup Socket Connection ---
const socket = io('http://localhost:3001'); 

const EditorPage = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const [code, setCode] = useState('// Waiting for server to load code...');
    const [aiSuggestion, setAiSuggestion] = useState('AI Mentor is listening...');
    const [summaryResult, setSummaryResult] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [status, setStatus] = useState('Connecting...');
    
    // --- NEW STATES FOR CODE EXECUTION ---
    const [language, setLanguage] = useState('javascript');
    const [codeOutput, setCodeOutput] = useState('Code execution output will appear here.');
    const [isRunning, setIsRunning] = useState(false);
    // ----------------------------
    
    // --- NEW STATES FOR CHAT AND USERS ---
    const [activeUserList, setActiveUserList] = useState([]);
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    // ----------------------------
    
    const editorRef = useRef(null);
    const codeUpdateSource = useRef(''); // Tracks who triggered the change
    const chatMessagesEndRef = useRef(null);
    const chatContainerRef = useRef(null);

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
    
    // --- NEW: RUN CODE HANDLER ---
    const handleRunCode = () => {
        setIsRunning(true);
        setCodeOutput('Executing code...');
        socket.emit('execute-code', roomId, code, language);
    };
    
    // --- NEW: HANDLE CHAT SUBMISSION ---
    const handleSendMessage = (e) => {
        e.preventDefault();
        if (chatInput.trim()) {
            socket.emit('send-message', roomId, chatInput);
            setChatInput('');
        }
    };
    
    // --- END CONNECTION HANDLER ---
    const handleEndConnection = () => {
        if (window.confirm('Are you sure you want to leave this session?')) {
            // Just navigate back to home
            // The useEffect cleanup will handle socket cleanup
            navigate('/');
        }
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

        // --- SUMMARY RESULT LISTENER ---
        socket.on('session-summary-result', (result) => {
            setSummaryResult(result);
            setIsGenerating(false);
        });

        // --- NEW: CODE EXECUTION OUTPUT LISTENER ---
        socket.on('code-output', (data) => {
            setIsRunning(false);
            if (data.success) {
                setCodeOutput(`[${data.language.toUpperCase()} Output]:\n${data.output}`);
            } else {
                setCodeOutput(`[Execution Error]:\n${data.output}`);
            }
        });

        // --- NEW: USER LIST UPDATE LISTENER ---
        socket.on('user-list-update', (users) => {
            setActiveUserList(users);
        });

        // --- NEW: INCOMING CHAT MESSAGE LISTENER ---
        socket.on('receive-message', (message) => {
            setMessages((prevMessages) => [...prevMessages, message]);
        });

        // Cleanup on unmount
        return () => {
            // Notify server that user is leaving
            if (socket.connected) {
                socket.emit('leave-room', roomId);
            }
            // Remove event listeners
            socket.off('load-code');
            socket.off('code-sync');
            socket.off('user-joined');
            socket.off('ai-suggestion');
            socket.off('session-summary-result');
            socket.off('code-output');
            socket.off('user-list-update');
            socket.off('receive-message');
        };
    }, [roomId, username]);

    // Auto-scroll chat to bottom when new messages arrive
    useEffect(() => {
        if (chatMessagesEndRef.current) {
            chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    return (
        <div className="editor-container">
            {/* Header Bar */}
            <div className="editor-header">
                {/* Left Section - Room/User Info */}
                <div className="header-left">
                    <div className="room-info">
                        <span className="text-muted">Room:</span>
                        <span className="room-id">{roomId}</span>
                    </div>
                    <div className="room-info">
                        <span className="text-muted">User:</span>
                        <span className="user-badge">{username}</span>
                    </div>
                    <div className="status-indicator">
                        <span className="status-dot"></span>
                        <span>{status}</span>
                    </div>
                </div>

                {/* Center Section - Code Controls */}
                <div className="header-center">
                    <select 
                        className="lang-selector"
                        value={language} 
                        onChange={(e) => setLanguage(e.target.value)} 
                    >
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="c">C</option>
                        <option value="cpp">C++</option>
                        <option value="java">Java</option>
                    </select>
                    <button 
                        className="btn-run"
                        onClick={handleRunCode} 
                        disabled={isRunning}
                    >
                        {isRunning ? 'Running...' : '▶ Run'}
                    </button>
                </div>

                {/* Right Section - Action Buttons */}
                <div className="header-right">
                    <button 
                        className="btn-summary"
                        onClick={handleGenerateSummary} 
                        disabled={isGenerating}
                    >
                        {isGenerating ? 'Summarizing...' : '📝 Summary'}
                    </button>
                    <button 
                        className="btn-end-connection"
                        onClick={handleEndConnection}
                    >
                        🚪 Leave Room
                    </button>
                </div>
            </div>

            {/* Main Collaboration Area */}
            <div className="editor-wrapper">
                {/* 1. User List Sidebar */}
                <div className="user-list-sidebar">
                    <h4 className="user-list-title">
                        Active Users ({activeUserList.length})
                    </h4>
                    <ul className="user-list">
                        {activeUserList.map((user, index) => (
                            <li key={index} className={user === username ? 'current-user' : ''}>
                                🟢 {user} {user === username && '(You)'}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* 2. Editor Main Area */}
                <div className="editor-main">
                    <div style={{ flex: 1, minHeight: 0 }}>
                        <Editor
                            height="100%"
                            defaultLanguage="javascript"
                            theme="vs-dark"
                            value={code}
                            onMount={handleEditorDidMount}
                            onChange={handleCodeChange}
                            options={{
                                minimap: { enabled: false },
                                padding: { top: 10 },
                                fontSize: 14,
                                wordWrap: 'on',
                                automaticLayout: true
                            }}
                        />
                    </div>
                    <div className="output-section">
                        <div className="output-content">{codeOutput}</div>
                    </div>
                </div>

                {/* 3. Chat Screen */}
                <div className="chat-screen">
                    <div className="chat-header">
                        <div className="chat-title">💬 Chat</div>
                        <div className="chat-online">🟢 {activeUserList.length} online</div>
                    </div>
                    <div className="chat-messages" ref={chatContainerRef}>
                        {messages.length === 0 ? (
                            <div className="chat-empty">
                                <div className="chat-empty-icon">💬</div>
                                <div className="chat-empty-text">No messages yet</div>
                                <div className="chat-empty-hint">Start the conversation!</div>
                            </div>
                        ) : (
                            <>
                                {messages.map((msg, index) => {
                                    const isMyMessage = msg.user === username;
                                    const showUserHeader = index === 0 || messages[index - 1].user !== msg.user;
                                    
                                    return (
                                        <div key={msg.id} className="chat-message-wrapper">
                                            {showUserHeader && (
                                                <div className={`chat-message-header ${isMyMessage ? 'chat-header-me' : 'chat-header-other'}`}>
                                                    <strong>{msg.user}</strong>
                                                </div>
                                            )}
                                            <div className={`chat-message ${isMyMessage ? 'chat-message-me' : 'chat-message-other'}`}>
                                                <div className="chat-message-text">{msg.text}</div>
                                                <div className="chat-timestamp">{msg.timestamp}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={chatMessagesEndRef} />
                            </>
                        )}
                    </div>
                    <form onSubmit={handleSendMessage} className="chat-form">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage(e);
                                }
                            }}
                            placeholder="Type a message..."
                            className="chat-input"
                            autoComplete="off"
                        />
                        <button 
                            type="submit" 
                            className="btn-chat-send"
                            disabled={!chatInput.trim()}
                        >
                            Send
                        </button>
                    </form>
                </div>
                
                {/* Summary Overlay */}
                {(summaryResult || aiSuggestion) && (
                    <div className="summary-sidebar">
                        {summaryResult && (
                            <div className="summary-content-wrapper">
                                <div className="summary-header">
                                    <div className="summary-title">📊 Session Report</div>
                                    <button 
                                        className="btn-close-summary"
                                        onClick={() => setSummaryResult('')}
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className="summary-content">{summaryResult}</div>
                            </div>
                        )}
                        
                        {/* AI Mentor - Bottom Right */}
                        {aiSuggestion && (
                            <div className="ai-mentor-container" title={aiSuggestion}>
                                <div className="ai-mentor-label">🤖 AI Mentor</div>
                                <div className="ai-mentor-text">{aiSuggestion}</div>
                            </div>
                        )}
                    </div>
                )}
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
        <div className="home-container">
            <div className="home-card">
                <div className="home-header">
                    <h1 className="home-title">DevEcho</h1>
                    <p className="home-subtitle">Real-time collaborative code editor with AI assistance</p>
                </div>
                
                <div className="home-actions">
                    <button className="btn-create" onClick={handleCreate}>
                        ✨ Create New Session
                    </button>
                    
                    <div className="divider">
                        <span className="text-muted">or</span>
                    </div>
                    
                    <div className="join-form">
                        <input
                            type="text"
                            value={inputRoomId}
                            onChange={(e) => setInputRoomId(e.target.value)}
                            placeholder="Enter Room ID"
                            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                        />
                        <button className="btn-join" onClick={handleJoin}>
                            Join Session
                        </button>
                    </div>
                </div>
            </div>
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