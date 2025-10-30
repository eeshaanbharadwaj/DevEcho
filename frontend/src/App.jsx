// devecho/frontend/src/App.jsx

import React from 'react';
import './App.css';
import { debounce } from './utils/debounce';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useAuth, useUser, useClerk, SignedIn, SignedOut, UserButton, SignInButton, ClerkLoaded } from '@clerk/clerk-react';
import { io } from 'socket.io-client';
import { useState, useEffect, useCallback, useRef } from 'react';

// --- Setup Socket Connection ---
const socket = io('http://localhost:3001'); 

const EditorPage = () => {

    const [targetLanguage, setTargetLanguage] = useState('python'); // Default target
    const [isTranslating, setIsTranslating] = useState(false);

    const handleTranslateCode = () => {
        setIsTranslating(true);
        socket.emit('request-translation', roomId, code, language, targetLanguage);
    };

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

    const { user, isSignedIn } = useUser();
    const clerkPreferredName =
        user?.username ||
        user?.fullName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
        (user?.primaryEmailAddress?.emailAddress ? user.primaryEmailAddress.emailAddress.split('@')[0] : undefined) ||
        user?.id;
    const username =
        (isSignedIn ? clerkPreferredName : undefined) ||
        localStorage.getItem('username') ||
        `User-${Math.floor(Math.random() * 1000)}`;

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
    
    // 3a. Join the room only when roomId or username changes
    useEffect(() => {
        if (!roomId || !username) return;
        socket.emit('join-room', roomId, username);
        return () => {
            if (socket.connected) {
                socket.emit('leave-room', roomId);
            }
        };
    }, [roomId, username]);

    // 3b. Socket.io Event Listeners (attach per room)
    useEffect(() => {
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

        // --- NEW: TRANSLATION RESULT LISTENER ---
        socket.on('receive-translation', (translatedCode) => {
            setIsTranslating(false);

            if (typeof translatedCode === 'string' && translatedCode.startsWith('Error:')) {
                setCodeOutput(translatedCode);
                return;
            }

            if (editorRef.current) {
                editorRef.current.setValue(translatedCode);
            }

            setLanguage(targetLanguage);
            setCodeOutput(`Code successfully translated from ${language} to ${targetLanguage}.`);
        });

        // Cleanup on room change/unmount: remove listeners only
        return () => {
            // Remove event listeners
            socket.off('load-code');
            socket.off('code-sync');
            socket.off('user-joined');
            socket.off('ai-suggestion');
            socket.off('session-summary-result');
            socket.off('code-output');
            socket.off('user-list-update');
            socket.off('receive-message');
            socket.off('receive-translation');
        };
    }, [roomId]);

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
                    <span className="translate-sep" aria-hidden="true">to</span>
                    {/* Target language for translation */}
                    <select
                        className="lang-selector"
                        value={targetLanguage}
                        onChange={(e) => setTargetLanguage(e.target.value)}
                        title="Target language"
                    >
                        <option value="python">Python</option>
                        <option value="javascript">JavaScript</option>
                        <option value="csharp">C#</option>
                        <option value="java">Java</option>
                    </select>
                    <button
                        className="btn-summary"
                        onClick={handleTranslateCode}
                        disabled={isTranslating || language === targetLanguage}
                        title="Translate code to target language"
                    >
                        {isTranslating ? 'Translating…' : '🌐 Translate'}
                    </button>
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
                    <SignedIn>
                        <UserButton afterSignOutUrl="/" />
                    </SignedIn>
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

// --- LandingPage Component (Entry Point to create/join rooms) ---
const LandingPage = () => {
    const [inputRoomId, setInputRoomId] = useState('');
    const navigate = useNavigate();
    const { isSignedIn } = useAuth();
    const { openSignIn } = useClerk();

    const handleJoin = () => {
        const trimmed = inputRoomId.trim();
        if (!trimmed) return;
        if (!isSignedIn) {
            openSignIn({ afterSignInUrl: `${window.location.origin}/room/${trimmed}` });
            return;
        }
        navigate(`/room/${trimmed}`);
    };
    
    const handleCreate = () => {
        const newRoomId = Math.random().toString(36).substring(2, 9);
        if (!isSignedIn) {
            openSignIn({ afterSignInUrl: `${window.location.origin}/room/${newRoomId}` });
            return;
        }
        navigate(`/room/${newRoomId}`);
    };

    return (
        <div className="landing">
            {/* Navbar */}
            <header className="nav">
                <div className="nav__wrap">
                    <div className="nav__brand">
                        <span className="logo">DevEcho</span>
                    </div>
                    <nav className="nav__actions">
                        <a href="#features" className="nav__link">Features</a>
                        <a href="#how" className="nav__link">How it works</a>
                        <a href="#pricing" className="nav__link">Pricing</a>
                        <button className="btn-primary nav__cta" onClick={handleCreate}>New Session</button>
                        <div style={{ marginLeft: 12 }} />
                        <SignedIn>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <UserButton afterSignOutUrl="/" />
                            </div>
                        </SignedIn>
                        <SignedOut>
                            <SignInButton mode="modal" afterSignInUrl={window.location.origin}>
                                <button className="btn-secondary">Sign in</button>
                            </SignInButton>
                        </SignedOut>
                    </nav>
                </div>
            </header>

            {/* Hero */}
            <section className="hero">
                <div className="hero__bg" />
                {/* Decorative light beams */}
                <div className="hero__beam hero__beam--a" />
                <div className="hero__beam hero__beam--b" />
                <div className="hero__inner">
                    <div className="hero__copy">
                        <h1 className="hero__title">Real‑time collaborative coding with AI that accelerates your team</h1>
                        <p className="hero__subtitle">
                            Spin up a secure room, code together in Monaco, chat, run snippets,
                            and get inline AI mentoring and summaries—without the setup.
                        </p>

                        <div className="hero__actions">
                            <button className="btn-primary hero__cta" onClick={handleCreate}>✨ Create New Session</button>
                            <div className="hero__join">
                        <input
                            type="text"
                            value={inputRoomId}
                            onChange={(e) => setInputRoomId(e.target.value)}
                            placeholder="Enter Room ID"
                            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                        />
                                <button className="btn-secondary" onClick={handleJoin}>Join Session</button>
                            </div>
                        </div>

                        <div className="trust">
                            <span className="trust__item">Encrypted rooms</span>
                            <span className="dot" />
                            <span className="trust__item">Zero installs</span>
                            <span className="dot" />
                            <span className="trust__item">AI summaries</span>
                        </div>

                        {/* Quick Start strip */}
                        <div className="quickstart">
                            <div className="quickstart__item">
                                <div className="quickstart__icon">1</div>
                                <div>
                                    <div className="quickstart__title">Create</div>
                                    <div className="quickstart__text">Spin up a unique room</div>
                                </div>
                            </div>
                            <div className="quickstart__sep" />
                            <div className="quickstart__item">
                                <div className="quickstart__icon">2</div>
                                <div>
                                    <div className="quickstart__title">Invite</div>
                                    <div className="quickstart__text">Share the room ID</div>
                                </div>
                            </div>
                            <div className="quickstart__sep" />
                            <div className="quickstart__item">
                                <div className="quickstart__icon">3</div>
                                <div>
                                    <div className="quickstart__title">Collaborate</div>
                                    <div className="quickstart__text">Code with chat & AI</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Product peek */}
                    <div className="hero__preview">
                        <div className="preview__window">
                            <div className="preview__titlebar">
                                <span className="dot red" />
                                <span className="dot yellow" />
                                <span className="dot green" />
                                <span className="preview__title">room/ab12cde</span>
                            </div>
                            <div className="preview__editor">
                                <pre>{`function greet(name) {
  return \`Hello, \${name}! 👋\`;
}

console.log(greet('DevEcho'));
/* AI Mentor: Consider adding input validation. */`}</pre>
                            </div>
                            <div className="preview__output">[JS Output]: Hello, DevEcho! 👋</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Quick features */}
            <section id="features" className="section features">
                <div className="section__head">
                    <h2>Built for fast collaboration</h2>
                    <p className="text-muted">Create, invite, and start coding in seconds.</p>
                </div>
                <div className="grid features__grid">
                    <div className="card feature">
                        <div className="feature__icon">⚡</div>
                        <h3>Realtime editor</h3>
                        <p>Low-latency Monaco with instant room sync.</p>
                    </div>
                    <div className="card feature">
                        <div className="feature__icon">🤖</div>
                        <h3>AI assist</h3>
                        <p>Inline suggestions and one-click summaries.</p>
                    </div>
                    <div className="card feature">
                        <div className="feature__icon">▶️</div>
                        <h3>Run & translate</h3>
                        <p>Execute code and convert between languages.</p>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section id="pricing" className="section cta">
                <div className="cta__card">
                    <h2>Start collaborating, free</h2>
                    <p className="text-muted">Unlimited sessions while in beta. No credit card required.</p>
                    <div className="cta__actions">
                        <button className="btn-primary" onClick={handleCreate}>Create Session</button>
                        <button className="btn-secondary" onClick={() => document.querySelector('.hero__join input')?.focus()}>
                            Join with ID
                        </button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="footer">
                <div className="footer__wrap">
                    <div className="footer__brand">DevEcho</div>
                    <div className="footer__links">
                        <a href="#features">Features</a>
                        <a href="#how">How it works</a>
                        <a href="#pricing">Pricing</a>
                    </div>
                    <div className="footer__legal">© {new Date().getFullYear()} DevEcho. All rights reserved. · Built by <a href="https://www.linkedin.com/in/eeshaanbharadwaj" target="_blank" rel="noreferrer noopener">Eeshaan Bharadwaj</a> · <a href="https://github.com/eeshaanbharadwaj" target="_blank" rel="noreferrer noopener">GitHub</a></div>
            </div>
            </footer>
        </div>
    );
};

// --- Router Setup ---
function App() {
    const { user, isSignedIn } = useUser();
    // ✅ Sync Clerk username to localStorage; fallback to random only if needed
    useEffect(() => {
        // Wait for Clerk to load fully before syncing
        if (!user) return;
        if (isSignedIn) {
            const preferred =
                user.username ||
                user.fullName ||
                [user.firstName, user.lastName].filter(Boolean).join(' ') ||
                (user.primaryEmailAddress?.emailAddress ? user.primaryEmailAddress.emailAddress.split('@')[0] : undefined) ||
                user.id;
            if (preferred) {
                localStorage.setItem('username', preferred);
                return;
            }
        }
        if (!localStorage.getItem('username')) {
            localStorage.setItem('username', `User-${Math.floor(Math.random() * 1000)}`);
        }
    }, [isSignedIn, user]);

    return (
        <ClerkLoaded>
            <Router>
                <Routes>
                    {/* Public landing page */}
                    <Route path="/" element={<LandingPage />} />

                    {/* Editor Route */}
                    <Route path="/room/:roomId" element={<EditorPage />} />
                </Routes>
            </Router>
        </ClerkLoaded>
    );
}

export default App;