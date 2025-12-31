import express from 'express';
import cors from 'cors';
import { generate } from './chatbot.js';

const app = express();
const port = 3001;
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Welcome to ChatDPT!');
});

app.post('/chat', async (req, res) => {
    const { message, threadId } = req.body;

    // Validate fields
    if (!message || !threadId) {
        res.status(400).json({ message: 'All fields are required!' });
        return;
    }

    if (typeof message !== 'string' || typeof threadId !== 'string') {
        res.status(400).json({ message: 'Invalid field types. Both message and threadId must be strings.' });
        return;
    }

    if (message.trim().length === 0) {
        res.status(400).json({ message: 'Message cannot be empty or contain only whitespace.' });
        return;
    }

    if (message.length > 5000) {
        res.status(400).json({ message: 'Message is too long. Maximum length is 5000 characters.' });
        return;
    }

    if (threadId.length < 5 || threadId.length > 100) {
        res.status(400).json({ message: 'Invalid threadId format.' });
        return;
    }

    try {
        console.log(`[${new Date().toISOString()}] Processing message from thread: ${threadId}`);
        const result = await generate(message, threadId);
        res.json({ message: result });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in /chat route:`, error);
        res.status(500).json({ 
            message: 'An error occurred while processing your request. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});
