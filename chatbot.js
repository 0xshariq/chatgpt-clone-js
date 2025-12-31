import Groq from 'groq-sdk';
import { tavily } from '@tavily/core';
import NodeCache from 'node-cache';

// Validate API keys
if (!process.env.TAVILY_API_KEY) {
    console.error('ERROR: TAVILY_API_KEY is not set in environment variables');
    throw new Error('Missing TAVILY_API_KEY environment variable');
}

if (!process.env.GROQ_API_KEY) {
    console.error('ERROR: GROQ_API_KEY is not set in environment variables');
    throw new Error('Missing GROQ_API_KEY environment variable');
}

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const cache = new NodeCache({ stdTTL: 60 * 60 * 24 }); // 24 hours

export async function generate(userMessage, threadId) {
    const baseMessages = [
        {
            role: 'system',
            content: `You are a smart personal assistant.
                    If you know the answer to a question, answer it directly in plain English.
                    If the answer requires real-time, local, or up-to-date information, or if you don’t know the answer, use the available tools to find it.
                    You have access to the following tool:
                    webSearch(query: string): Use this to search the internet for current or unknown information.
                    Decide when to use your own knowledge and when to use the tool.
                    Do not mention the tool unless needed.

                    Examples:
                    Q: What is the capital of France?
                    A: The capital of France is Paris.

                    Q: What’s the weather in Mumbai right now?
                    A: (use the search tool to find the latest weather)

                    Q: Who is the Prime Minister of India?
                    A: The current Prime Minister of India is Narendra Modi.

                    Q: Tell me the latest IT news.
                    A: (use the search tool to get the latest news)

                    current date and time: ${new Date().toUTCString()}`,
        },
        // {
        //     role: 'user',
        //     content: 'What is the current weather in Mumbai?',
        //     // When was iphone 16 launched?
        //     // What is the current weather in Mumbai?
        // },
    ];

    const messages = cache.get(threadId) ?? baseMessages;

    messages.push({
        role: 'user',
        content: userMessage,
    });

    const MAX_RETRIES = 10;
    let count = 0;

    while (true) {
        if (count > MAX_RETRIES) {
            console.error(`Max retries (${MAX_RETRIES}) reached for thread: ${threadId}`);
            return 'I apologize, but I could not process your request after multiple attempts. Please try again or rephrase your question.';
        }
        count++;

        try {
            const completions = await groq.chat.completions.create({
                model: 'llama-3.1-70b-versatile',
                temperature: 0.1,
                messages: messages,
                tools: [
                    {
                        type: 'function',
                        function: {
                            name: 'webSearch',
                            description:
                                'Search the latest information and realtime data on the internet.',
                            parameters: {
                                type: 'object',
                                properties: {
                                    query: {
                                        type: 'string',
                                        description: 'The search query to perform search on.',
                                    },
                                },
                                required: ['query'],
                            },
                        },
                    },
                ],
                tool_choice: 'auto',
            });

            if (!completions.choices || completions.choices.length === 0) {
                throw new Error('No response from AI model');
            }

            messages.push(completions.choices[0].message);

            const toolCalls = completions.choices[0].message.tool_calls;

            if (!toolCalls) {
                // here we end the chatbot response
                cache.set(threadId, messages);
                return completions.choices[0].message.content;
            }

            for (const tool of toolCalls) {
                const functionName = tool.function.name;
                const functionParams = tool.function.arguments;

                if (functionName === 'webSearch') {
                    try {
                        const toolResult = await webSearch(JSON.parse(functionParams));
                        messages.push({
                            tool_call_id: tool.id,
                            role: 'tool',
                            name: functionName,
                            content: toolResult,
                        });
                    } catch (toolError) {
                        console.error('Error in webSearch:', toolError);
                        messages.push({
                            tool_call_id: tool.id,
                            role: 'tool',
                            name: functionName,
                            content: 'Error performing web search. Please try again.',
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`Error in completion attempt ${count}:`, error);

            // Check if it's a tool_use_failed error - don't retry these
            if (error.status === 400 && error.error?.error?.code === 'tool_use_failed') {
                console.error('Tool calling failed, falling back to direct response');

                // Try without tools on next attempt
                try {
                    const fallbackCompletion = await groq.chat.completions.create({
                        model: 'llama-3.1-70b-versatile',
                        temperature: 0.1,
                        messages: [
                            ...messages.slice(0, -1), // Remove the last user message
                            {
                                role: 'user',
                                content: `${messages[messages.length - 1].content}\n\nNote: Unable to search the web. Please provide the best answer you can based on your knowledge. If you don't know, say so clearly.`
                            }
                        ],
                        // No tools - just direct response
                    });

                    if (fallbackCompletion.choices && fallbackCompletion.choices[0]) {
                        cache.set(threadId, messages);
                        return fallbackCompletion.choices[0].message.content || 'I apologize, but I cannot process this request right now. Please try rephrasing your question.';
                    }
                } catch (fallbackError) {
                    console.error('Fallback completion failed:', fallbackError);
                }

                return 'I apologize, but I\'m having trouble processing your request. This might be due to the complexity of the question or current system limitations. Please try rephrasing or ask something else.';
            }

            if (count >= MAX_RETRIES) {
                throw error;
            }
            // Continue to next iteration on error
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
    }
}
async function webSearch({ query }) {
    console.log(`[${new Date().toISOString()}] Calling web search for query: ${query}`);

    try {
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            throw new Error('Invalid search query');
        }

        const response = await tvly.search(query, {
            maxResults: 5,
            includeAnswer: true
        });

        if (!response || !response.results || response.results.length === 0) {
            return 'No search results found for your query.';
        }

        const finalResult = response.results
            .map((result) => result.content)
            .filter(content => content && content.trim().length > 0)
            .join('\n\n');

        return finalResult || 'No relevant information found.';
    } catch (error) {
        console.error('Error in webSearch:', error);
        throw new Error(`Web search failed: ${error.message}`);
    }
}
