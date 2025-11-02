# DevEcho

**Real-time collaborative coding platform with AI assistance**

DevEcho is a powerful web-based collaborative coding environment that enables teams to code together in real-time with built-in AI mentoring, code execution, language translation, and chat features.

![DevEcho](https://img.shields.io/badge/DevEcho-Beta-blue) ![Node.js](https://img.shields.io/badge/Node.js-v20+-green) ![React](https://img.shields.io/badge/React-v19-blue) ![License](https://img.shields.io/badge/License-ISC-yellow)

## ✨ Features

### Real-time Collaboration
- **Instant Code Sync**: Real-time code synchronization using Socket.io
- **Multi-user Editing**: Multiple developers can edit simultaneously
- **Active User List**: See who's currently in the session
- **Room-based Sessions**: Create or join rooms using unique room IDs

### AI-Powered Features
- **AI Mentor**: Get real-time code suggestions and best practice recommendations powered by Google Gemini
- **Session Summaries**: Generate AI-powered summaries of your coding sessions
- **Code Translation**: Translate code between multiple programming languages (JavaScript, Python, C, C++, Java, C#)

### Code Execution & Testing
- **Run Code**: Execute code snippets in multiple languages using Piston API
- **Live Output**: See execution results in real-time
- **Multi-language Support**: JavaScript, Python, C, C++, Java

### Communication
- **In-app Chat**: Real-time messaging within coding sessions
- **User Presence**: See active users and their status

### Editor Features
- **Monaco Editor**: Industry-standard code editor with syntax highlighting
- **Dark Theme**: Built-in dark mode for comfortable coding
- **Multiple Language Support**: Code in JavaScript, Python, C, C++, Java

## 🛠️ Tech Stack

### Frontend
- **React 19** - UI library
- **Vite** - Build tool and dev server
- **Monaco Editor** - Code editor
- **Socket.io Client** - Real-time communication
- **React Router** - Routing
- **Clerk** - Authentication
- **CSS3** - Styling

### Backend
- **Node.js** - Runtime environment
- **Express 5** - Web framework
- **Socket.io** - Real-time bidirectional communication
- **MongoDB** - Database (with Mongoose ODM)
- **Google Gemini AI** - AI-powered features
- **Piston API** - Code execution engine
- **Clerk SDK** - Authentication backend

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v20 or higher)
- **npm** or **yarn**
- **MongoDB** (local or cloud instance like MongoDB Atlas)
- **Git**

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd "DevEcho final"
```

### 2. Install Dependencies

#### Backend
```bash
cd DevEcho/backend
npm install
```

#### Frontend
```bash
cd ../frontend
npm install
```

### 3. Environment Variables

#### Backend (`DevEcho/backend/.env`)
Create a `.env` file in the `backend` directory with the following variables:

```env
# MongoDB Connection
MONGO_URI=your_mongodb_connection_string

# Google Gemini API Key
GEMINI_API_KEY=your_gemini_api_key

# Clerk Authentication (Optional - if using Clerk backend)
CLERK_SECRET_KEY=your_clerk_secret_key
```

#### Frontend (`DevEcho/frontend/.env`)
Create a `.env` file in the `frontend` directory:

```env
# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

### 4. Run the Application

#### Start Backend Server
```bash
cd DevEcho/backend
npm start
# or for development with auto-reload:
npx nodemon server.js
```

The backend server will run on `http://localhost:3001`

#### Start Frontend Development Server
```bash
cd DevEcho/frontend
npm run dev
```

The frontend will run on `http://localhost:5173`

### 5. Access the Application

Open your browser and navigate to `http://localhost:5173`

## 📁 Project Structure

```
DevEcho final/
├── DevEcho/
│   ├── backend/
│   │   ├── models/
│   │   │   └── CodeSession.js    # MongoDB schema for code sessions
│   │   ├── node_modules/
│   │   ├── package.json
│   │   ├── server.js              # Express server with Socket.io
│   │   └── .env                   # Backend environment variables
│   │
│   └── frontend/
│       ├── public/
│       ├── src/
│       │   ├── assets/
│       │   ├── utils/
│       │   │   └── debounce.js    # Debounce utility for AI calls
│       │   ├── App.jsx            # Main React component
│       │   ├── App.css            # Application styles
│       │   ├── index.css          # Global styles
│       │   └── main.jsx           # React entry point
│       ├── index.html
│       ├── package.json
│       ├── vite.config.js
│       ├── vercel.json            # Vercel deployment config
│       └── .env                   # Frontend environment variables
│
└── README.md
```

## 🌐 Deployment

### Frontend (Vercel)
The frontend is configured for Vercel deployment with SPA routing support. The `vercel.json` handles routing.

### Backend (Render/Railway/Heroku)
Deploy the backend to any Node.js hosting service. Ensure:
- Set environment variables in your hosting platform
- Update CORS allowed origins to include your frontend domain
- MongoDB connection string is configured

### Environment Variables for Production
Update the `ALLOWED_ORIGINS` array in `backend/server.js` to include your production domains:

```javascript
const ALLOWED_ORIGINS = [
    "https://your-frontend-domain.com",
    "http://localhost:5173", // Keep for local development
];
```

## 🔑 API Keys Setup

### Google Gemini API
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add it to your backend `.env` file

### Clerk Authentication
1. Sign up at [Clerk](https://clerk.com)
2. Create a new application
3. Copy your publishable key and secret key
4. Add them to respective `.env` files

### MongoDB
1. Sign up at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free tier available)
2. Create a cluster and database
3. Get your connection string
4. Add it to your backend `.env` file

## 🎯 Usage

1. **Create a Session**: Click "Create New Session" to generate a unique room ID
2. **Join a Session**: Enter a room ID and click "Join Session"
3. **Invite Collaborators**: Share the room ID with your team members
4. **Code Together**: Start coding! Changes sync in real-time
5. **Use AI Features**: 
   - Get suggestions automatically as you code (3-second debounce)
   - Click "📝 Summary" to generate a session summary
   - Click "🌐 Translate" to convert code to another language
6. **Execute Code**: Select language and click "▶ Run" to execute
7. **Chat**: Use the chat panel to communicate with collaborators

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License.

## 👨‍💻 Author

**Eeshaan Bharadwaj**
- LinkedIn: [@eeshaanbharadwaj](https://www.linkedin.com/in/eeshaanbharadwaj)
- GitHub: [@eeshaanbharadwaj](https://github.com/eeshaanbharadwaj)

## 🙏 Acknowledgments

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Socket.io](https://socket.io/) - Real-time communication
- [Google Gemini](https://deepmind.google/technologies/gemini/) - AI features
- [Piston API](https://emkc.org/) - Code execution
- [Clerk](https://clerk.com/) - Authentication

## 📧 Support

For support, email [your-email] or open an issue on GitHub.

---

Made with ❤️ by the DevEcho team

