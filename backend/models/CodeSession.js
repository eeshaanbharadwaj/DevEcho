// devecho/backend/models/CodeSession.js
const mongoose = require('mongoose');

const CodeSessionSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true
    },
    code: {
        type: String,
        default: '// Start coding here...'
    },
    // Optional: store a history of changes or the AI summary here later
    summary: {
        type: String,
        default: 'No summary yet.'
    }
}, { timestamps: true });

module.exports = mongoose.model('CodeSession', CodeSessionSchema);