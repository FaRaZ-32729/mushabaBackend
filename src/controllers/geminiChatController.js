require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const User = require('../models/userSchema');
const Connection = require('../models/connectionSchema');
const ActivityLog = require('../models/activityLogSchema');
const { classifyQuery, handleSimpleQuery } = require('../services/geminiQueryServices');
const { ConnectionLocation } = require('../models/locationSchema');



// Health check
const checkHealth = (req, res) => {
    const hasKey = !!process.env.GOOGLE_API_KEY;
    return res.json({ success: true, geminiConfigured: hasKey });
};

// Chat endpoint using Gemini Flash with MongoDB context
const gemeniChat = async (req, res) => {
    console.warn('[GEMINI_DEBUG] Chat endpoint reached!');
    try {
        const apiKey = process.env.GOOGLE_API_KEY;
        console.warn('[GEMINI_DEBUG] API Key exists:', !!apiKey);
        console.warn('[GEMINI_DEBUG] API Key length:', apiKey ? apiKey.length : 0);
        if (!apiKey) {
            console.warn('[GEMINI_DEBUG] No API key found in environment variables');
            return res.status(500).json({ success: false, message: 'GOOGLE_API_KEY is not configured' });
        }

        const { userText } = req.body || {};
        if (!userText || typeof userText !== 'string') {
            return res.status(400).json({ success: false, message: 'userText is required' });
        }

        const userId = req.user.id;
        console.warn('[GEMINI_DEBUG] User ID:', userId);
        console.warn('[GEMINI_DEBUG] User query:', userText);

        // Classify the query first (before fetching data)
        const classification = classifyQuery(userText);
        console.warn('[GEMINI_DEBUG] Query classification:', classification);

        // Build comprehensive domain context from MongoDB (needed for both simple and complex queries)
        console.warn('[GEMINI_DEBUG] Fetching user and connection data...');
        const user = await User.findById(userId).select('name username email phone nationality image qrCode createdAt status lastSeen').lean();
        console.warn('[GEMINI_DEBUG] User data fetched:', !!user);

        // Try to get active connection with multiple fallback strategies
        let activeConnectionRaw = null;
        try {
            // Strategy 1: Use the strict method (requires metadata.status: 'active')
            activeConnectionRaw = await Connection.getUserActiveConnection(userId);
            console.warn('[GEMINI_DEBUG] Strategy 1 (strict) - Active connection fetched:', !!activeConnectionRaw);

            // Strategy 2: If no connection found, try a more lenient query
            if (!activeConnectionRaw) {
                console.warn('[GEMINI_DEBUG] Strategy 1 failed, trying Strategy 2 (lenient)...');
                activeConnectionRaw = await Connection.findOne({
                    'users.userId': userId,
                    'users.status': 'active'
                });
                console.warn('[GEMINI_DEBUG] Strategy 2 (lenient) - Connection found:', !!activeConnectionRaw);

                // If found, verify user is actually active in it
                if (activeConnectionRaw) {
                    const userInConnection = activeConnectionRaw.users.find(u =>
                        u.userId.toString() === userId.toString() && u.status === 'active'
                    );
                    if (!userInConnection) {
                        console.warn('[GEMINI_DEBUG] User not active in connection, setting to null');
                        activeConnectionRaw = null;
                    } else {
                        console.warn('[GEMINI_DEBUG] User is active in connection, proceeding...');
                        // Log connection status for debugging
                        console.warn('[GEMINI_DEBUG] Connection metadata.status:', activeConnectionRaw.metadata?.status);
                        console.warn('[GEMINI_DEBUG] Connection users count:', activeConnectionRaw.users?.length);
                    }
                }
            }

            // Strategy 3: If still no connection, check if user is in ANY connection (for debugging)
            if (!activeConnectionRaw) {
                console.warn('[GEMINI_DEBUG] Strategy 2 failed, checking if user is in ANY connection...');
                const anyConnection = await Connection.findOne({
                    'users.userId': userId
                });
                console.warn('[GEMINI_DEBUG] Any connection found:', !!anyConnection);
                if (anyConnection) {
                    console.warn('[GEMINI_DEBUG] Connection found but user status:', anyConnection.users.find(u => u.userId.toString() === userId.toString())?.status);
                    console.warn('[GEMINI_DEBUG] Connection metadata.status:', anyConnection.metadata?.status);
                }
            }
        } catch (error) {
            console.warn('[GEMINI_DEBUG] Error fetching connection:', error.message);
            console.warn('[GEMINI_DEBUG] Error stack:', error.stack);
        }

        // Populate connection users with full user details
        let activeConnection = null;
        if (activeConnectionRaw) {
            try {
                console.warn('[GEMINI_DEBUG] Populating connection with ID:', activeConnectionRaw._id);
                // Populate user details for all connection members
                const populatedConnection = await Connection.findById(activeConnectionRaw._id)
                    .populate({
                        path: 'users.userId',
                        select: 'name username email phone nationality image status lastSeen createdAt',
                        model: 'User'
                    })
                    .lean();

                activeConnection = populatedConnection;
                console.warn('[GEMINI_DEBUG] Connection populated successfully');
                console.warn('[GEMINI_DEBUG] Active users count:', activeConnection?.users?.filter(u => u.status === 'active').length);
                console.warn('[GEMINI_DEBUG] Total users count:', activeConnection?.users?.length);
            } catch (error) {
                console.warn('[GEMINI_DEBUG] Error populating connection users:', error);
                console.warn('[GEMINI_DEBUG] Error stack:', error.stack);
                activeConnection = activeConnectionRaw;
            }
        } else {
            console.warn('[GEMINI_DEBUG] No active connection found for user');
        }

        // Fetch activity logs
        let activity = [];
        try {
            if (activeConnection && activeConnection._id) {
                console.warn('[GEMINI_DEBUG] Fetching activity logs for connection:', activeConnection._id);
                activity = await ActivityLog.find({ connectionId: activeConnection._id })
                    .sort({ createdAt: -1 })
                    .limit(50) // Increased limit for better history
                    .lean();
                console.warn('[GEMINI_DEBUG] Activity logs fetched:', activity.length);
            } else {
                console.warn('[GEMINI_DEBUG] No active connection, skipping activity logs');
            }
        } catch (error) {
            console.warn('[GEMINI_DEBUG] Error fetching activity logs:', error);
            console.warn('[GEMINI_DEBUG] Error stack:', error.stack);
        }

        // Get member locations (current locations, not personal bus/hotel)
        let memberLocations = [];
        if (activeConnection && activeConnection._id) {
            try {
                console.warn('[GEMINI_DEBUG] Fetching member locations for connection:', activeConnection._id);
                // Don't populate userId - we'll get names from activeConnection instead
                const connectionLocation = await ConnectionLocation.findOne({
                    connectionId: activeConnection._id
                })
                    .lean();

                console.warn('[GEMINI_DEBUG] ConnectionLocation found:', !!connectionLocation);
                if (connectionLocation) {
                    console.warn('[GEMINI_DEBUG] ConnectionLocation users array length:', connectionLocation.users?.length || 0);
                }

                if (connectionLocation && connectionLocation.users && connectionLocation.users.length > 0) {
                    // Create a map of userId to user name from connection
                    const userMap = new Map();
                    (activeConnection?.users || [])
                        .filter(u => u.status !== 'removed')
                        .forEach(u => {
                            const userId = u.userId && typeof u.userId === 'object' ? u.userId._id : u.userId;
                            const uid = userId?.toString ? userId.toString() : userId;
                            const userData = u.userId && typeof u.userId === 'object' ? u.userId : null;
                            userMap.set(uid, userData?.name || 'Unknown');
                        });

                    console.warn('[GEMINI_DEBUG] Active users in connection:', userMap.size);
                    console.warn('[GEMINI_DEBUG] Active user IDs:', Array.from(userMap.keys()));

                    // Get active user IDs from connection to filter locations
                    const activeUserIds = new Set(userMap.keys());

                    // Helper function to extract userId as string
                    const getUserIdString = (userId) => {
                        if (!userId) return null;
                        if (typeof userId === 'string') return userId;
                        if (typeof userId === 'object') {
                            // If it's an ObjectId or has _id
                            if (userId._id) return userId._id.toString();
                            if (userId.toString) return userId.toString();
                        }
                        return String(userId);
                    };

                    // Debug: Log all users in ConnectionLocation
                    connectionLocation.users.forEach((u, idx) => {
                        const uid = getUserIdString(u.userId);
                        console.warn(`[GEMINI_DEBUG] ConnectionLocation user ${idx}: userId=${uid}, hasLocation=${!!u.currentLocation}`);
                    });

                    memberLocations = connectionLocation.users
                        .filter(u => {
                            const uid = getUserIdString(u.userId);
                            if (!uid) {
                                console.warn(`[GEMINI_DEBUG] User filtered out: no userId`);
                                return false;
                            }

                            const isActive = activeUserIds.has(uid);
                            const hasLocation = !!u.currentLocation;
                            if (!isActive) {
                                console.warn(`[GEMINI_DEBUG] User ${uid} filtered out: not in active users (activeUserIds: ${Array.from(activeUserIds).join(', ')})`);
                            }
                            if (!hasLocation) {
                                console.warn(`[GEMINI_DEBUG] User ${uid} filtered out: no currentLocation`);
                            }
                            return isActive && hasLocation;
                        })
                        .map(u => {
                            const uid = getUserIdString(u.userId);
                            return {
                                userId: uid,
                                name: userMap.get(uid) || 'Unknown',
                                username: null, // We don't populate userId, so we don't have username here
                                latitude: u.currentLocation?.latitude || null,
                                longitude: u.currentLocation?.longitude || null,
                                floor: u.currentLocation?.floor || null,
                                online: u.currentLocation?.online || false,
                                lastUpdated: u.currentLocation?.lastUpdated || null
                            };
                        });

                    console.warn('[GEMINI_DEBUG] Member locations after filtering:', memberLocations.length);
                } else {
                    console.warn('[GEMINI_DEBUG] No ConnectionLocation document or empty users array');
                }
            } catch (error) {
                console.warn('[GEMINI_DEBUG] Error fetching member locations:', error);
                console.warn('[GEMINI_DEBUG] Error stack:', error.stack);
            }
        }

        // If it's a simple query, handle it in code (no Gemini needed)
        if (classification.queryType === 'simple' && classification.type !== 'complex') {
            console.warn('[SIMPLE_QUERY] Handling query in code, skipping Gemini');
            const simpleResponse = await handleSimpleQuery(
                classification.type,
                userText,
                userId,
                user,
                activeConnection,
                activity,
                memberLocations
            );

            if (simpleResponse) {
                console.warn('[SIMPLE_QUERY] Response generated:', simpleResponse);
                return res.json({ success: true, response: simpleResponse });
            }
            // If handler returns null, fall through to Gemini
            console.warn('[SIMPLE_QUERY] Handler returned null, falling back to Gemini');
        }

        // Complex query or simple query handler failed - use Gemini
        console.warn('[GEMINI_DEBUG] Using Gemini for query processing');

        // Create Gemini client only when needed (for complex queries)
        console.warn('[GEMINI_DEBUG] Creating GoogleGenerativeAI client...');
        const genAI = new GoogleGenerativeAI(apiKey);
        console.warn('[GEMINI_DEBUG] Getting generative model...');
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                temperature: 0.7,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 1024,
            }
        });
        console.warn('[GEMINI_DEBUG] Model created successfully');

        // Prepare comprehensive context object (avoid sending sensitive fields like password)
        console.warn('[GEMINI_DEBUG] Building context object...');
        console.warn('[GEMINI_DEBUG] Has activeConnection:', !!activeConnection);
        console.warn('[GEMINI_DEBUG] Has memberLocations:', memberLocations.length);
        console.warn('[GEMINI_DEBUG] Has activity:', activity.length);

        const context = {
            currentUser: user ? {
                id: userId,
                name: user.name,
                username: user.username,
                email: user.email,
                phone: user.phone || null,
                nationality: user.nationality || null,
                image: user.image || null,
                createdAt: user.createdAt,
                status: user.status,
                lastSeen: user.lastSeen
            } : null,
            activeConnection: activeConnection
                ? {
                    id: activeConnection._id,
                    status: activeConnection.metadata?.status,
                    createdAt: activeConnection.metadata?.createdAt || activeConnection.createdAt,
                    // Users with full details
                    users: (activeConnection.users || [])
                        .filter(u => u.status !== 'removed') // Only active users
                        .map(u => {
                            const userData = u.userId && typeof u.userId === 'object' ? u.userId : null;
                            return {
                                userId: userData?._id?.toString() || u.userId?.toString() || u.userId,
                                name: userData?.name || 'Unknown',
                                username: userData?.username || null,
                                email: userData?.email || null, // Added email
                                phone: userData?.phone || null, // Added phone
                                nationality: userData?.nationality || null, // Added nationality
                                image: userData?.image || null, // Added image
                                role: u.role, // 'owner' or 'member'
                                status: u.status, // 'active' or 'removed'
                                joinedAt: u.joinedAt || null,
                                addedBy: u.addedBy?.toString() || null,
                                createdAt: userData?.createdAt || null, // Added createdAt
                                lastSeen: userData?.lastSeen || null // Added lastSeen
                            };
                        }),
                    // Group/Connection bus and hotel locations (NOT personal)
                    groupLocations: {
                        bus: activeConnection.groupLocations?.bus && activeConnection.groupLocations.bus.isActive
                            ? {
                                name: activeConnection.groupLocations.bus.name || null,
                                address: activeConnection.groupLocations.bus.address || null,
                                latitude: activeConnection.groupLocations.bus.latitude || null,
                                longitude: activeConnection.groupLocations.bus.longitude || null,
                                comment: activeConnection.groupLocations.bus.comment || null,
                                markedAt: activeConnection.groupLocations.bus.markedAt || null,
                                markedBy: activeConnection.groupLocations.bus.markedBy?.toString() || null
                            }
                            : null,
                        hotel: activeConnection.groupLocations?.hotel && activeConnection.groupLocations.hotel.isActive
                            ? {
                                name: activeConnection.groupLocations.hotel.name || null,
                                address: activeConnection.groupLocations.hotel.address || null,
                                latitude: activeConnection.groupLocations.hotel.latitude || null,
                                longitude: activeConnection.groupLocations.hotel.longitude || null,
                                roomNo: activeConnection.groupLocations.hotel.roomNo || null,
                                comment: activeConnection.groupLocations.hotel.comment || null,
                                markedAt: activeConnection.groupLocations.hotel.markedAt || null,
                                markedBy: activeConnection.groupLocations.hotel.markedBy?.toString() || null
                            }
                            : null
                    },
                    // Legacy marked locations (for backward compatibility)
                    markedLocations: (activeConnection.markedLocations || []).slice(-10).map(m => ({
                        type: m.type,
                        name: m.name,
                        latitude: m.latitude,
                        longitude: m.longitude,
                        updatedAt: m.updatedAt
                    }))
                }
                : null,
            // Member current locations (real-time, not personal bus/hotel)
            memberLocations: memberLocations,
            // Recent activity with full details
            recentActivity: (activity || []).map(a => ({
                type: a.activityType, // 'join_connection', 'leave_connection', 'remove_user', 'create_connection', 'transfer_ownership', etc.
                at: a.createdAt,
                actor: {
                    name: a.actor?.name || null,
                    userId: a.actor?.userId?.toString() || a.actor?.userId || null
                },
                target: a.target ? {
                    name: a.target?.name || null,
                    userId: a.target?.userId?.toString() || a.target?.userId || null
                } : null,
                message: a.message
            }))
        };

        // Log context summary for debugging
        console.warn('[GEMINI_DEBUG] Context summary:');
        console.warn('[GEMINI_DEBUG] - currentUser:', context.currentUser ? `${context.currentUser.name} (${context.currentUser.id})` : 'null');
        console.warn('[GEMINI_DEBUG] - activeConnection:', context.activeConnection ? `ID: ${context.activeConnection.id}, Users: ${context.activeConnection.users?.length || 0}` : 'null');
        console.warn('[GEMINI_DEBUG] - memberLocations:', context.memberLocations?.length || 0);
        console.warn('[GEMINI_DEBUG] - recentActivity:', context.recentActivity?.length || 0);

        const now = new Date().toISOString();

        // Enhanced prompt with examples and comprehensive guidelines
        const prompt = `You are a helpful assistant for a location-sharing and group management app called Mushaba.

Current DateTime: ${now}

Context (JSON): ${JSON.stringify(context, null, 2)}

User Query: ${userText}

IMPORTANT GUIDELINES:
1. Answer briefly and clearly (1-3 sentences maximum unless more detail is requested)
2. Use ONLY the provided context - do NOT invent or assume data
3. If information is not in the context, say "I don't have that information" or "I don't understand"
4. For unclear queries, respond with: "I don't understand. Could you please rephrase your question?"
5. Avoid code blocks unless explicitly asked
6. Be conversational and friendly

SUPPORTED QUERIES (with examples):

ABOUT CURRENT USER:
- "Who am I?" / "Who is me?" → Tell about current user (name, username, nationality, phone, etc.)
- "What is my nationality?" → Current user's nationality
- "What is my phone number?" → Current user's phone number
- "What is my name?" → Current user's name
- "What is my username?" → Current user's username
- "When did I join?" → Current user's account creation date

ABOUT CONNECTION/GROUP:
- "Who is the owner?" / "Who is the owner of the group?" → Find user with role: 'owner' in activeConnection.users array, return their name
- "How many members are in the connection?" / "How many people in the group?" → Count activeConnection.users array (filter status: 'active')
- "Tell me names of all members" / "List all members" → List all names from activeConnection.users where status is 'active'
- "Who joined recently?" / "Who is the latest joined?" → Check recentActivity array for 'join_connection' type, find the most recent one
- "Who left?" / "Who left the group?" → Check recentActivity array for 'leave_connection' or 'remove_user' types
- "When was the connection built?" / "When was the group created?" → Use activeConnection.createdAt date
- "Who are the first members?" → Sort activeConnection.users by joinedAt (earliest first), return their names

ABOUT MEMBER LOCATIONS:
- "Where are the members?" / "Show member locations" → Current real-time locations of members (from memberLocations array)
- "Who is online?" → Members with online status (check memberLocations for online: true)
- "Where is [member name]?" → Specific member's current location (from memberLocations array)
- If memberLocations is empty or has no data, you can still answer based on activeConnection.users list, but note that location data is not available

ABOUT GROUP LOCATIONS (NOT personal):
- "Where is our bus station?" / "Where is the group bus?" → Group bus location (groupLocations.bus)
- "Where is our hotel?" / "Where is the group hotel?" → Group hotel location (groupLocations.hotel)
- "What is our hotel room number?" → Group hotel room number

HELP QUERIES:
- "I'm lost" / "Help me" → Provide helpful guidance about using the app or getting help
- "I don't understand" → Acknowledge and ask for clarification

IMPORTANT NOTES:
- DO NOT access personal bus/hotel locations (only group/connection locations are available)
- Personal member locations (latitude/longitude) are available in memberLocations array
- If memberLocations is empty, you can still answer questions about members using activeConnection.users
- Use activity logs (recentActivity) to determine who joined/left and when
- Owner is identified by role: 'owner' in activeConnection.users array
- Only include active members (status: 'active', not 'removed')
- Connection status (active/inactive) does not prevent answering questions - use the connection data if available
- If 'activeConnection' is null in the context, the user is NOT currently in any connection/group
- When activeConnection is null, respond to connection/group queries with: "You are not currently in any connection or group. Please join or create a connection first."
- ALWAYS provide helpful answers when you have the data - don't say "I don't understand" if you have the information in the context

HANDLING NO CONNECTION:
- If the user asks about connection/group/members and 'activeConnection' is null, tell them they are not in any connection
- Example: "You are not currently in any connection or group."
- Do NOT say "I don't have information" for connection queries when activeConnection is null - be specific that they're not in a connection

If the query doesn't match any of these patterns or you don't have the information, respond with: "I don't understand. Could you please rephrase your question?"`;

        console.warn('[GEMINI_DEBUG] Generating content with Gemini...');
        console.warn('[GEMINI_DEBUG] Prompt length:', prompt.length);

        // Add timeout to the Gemini API call
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Gemini API timeout after 30 seconds')), 30000);
        });

        const geminiPromise = model.generateContent([prompt]);
        const result = await Promise.race([geminiPromise, timeoutPromise]);

        console.warn('[GEMINI_DEBUG] Gemini response received');
        let text = result?.response?.text?.() || '';
        console.warn('[GEMINI_DEBUG] Response text length:', text.length);

        // Default fallback if no response or empty response
        if (!text || text.trim().length === 0) {
            text = "I don't understand. Could you please rephrase your question?";
        }

        // Clean up response (remove any unwanted formatting)
        text = text.trim();

        return res.json({ success: true, response: text });
    } catch (error) {
        console.warn('[GEMINI_DEBUG] Error occurred:', error.message);
        console.warn('[GEMINI_DEBUG] Error stack:', error.stack);

        // Check for specific error types and return appropriate messages
        const errorMessage = error.message || '';
        const errorString = error.toString();

        // Check for quota/rate limit errors (429)
        if (errorMessage.includes('429') ||
            errorMessage.includes('Too Many Requests') ||
            errorMessage.includes('quota') ||
            errorMessage.includes('Quota exceeded') ||
            errorString.includes('429') ||
            errorString.includes('quota')) {
            console.warn('[GEMINI_DEBUG] Quota/rate limit error detected');
            return res.json({
                success: true,
                response: "I'm sorry, but I've reached my daily request limit. Please try again later or contact support if you need immediate assistance."
            });
        }

        // Check for API key errors
        if (errorMessage.includes('API key') ||
            errorMessage.includes('authentication') ||
            errorMessage.includes('401') ||
            errorMessage.includes('Unauthorized')) {
            console.warn('[GEMINI_DEBUG] API key/authentication error detected');
            return res.json({
                success: true,
                response: "I'm experiencing a configuration issue. Please contact support."
            });
        }

        // Check for timeout errors
        if (errorMessage.includes('timeout') ||
            errorMessage.includes('Timeout') ||
            errorMessage.includes('ETIMEDOUT')) {
            console.warn('[GEMINI_DEBUG] Timeout error detected');
            return res.json({
                success: true,
                response: "I'm taking too long to respond. Please try again in a moment."
            });
        }

        // Check for network/connection errors
        if (errorMessage.includes('network') ||
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('fetch failed')) {
            console.warn('[GEMINI_DEBUG] Network error detected');
            return res.json({
                success: true,
                response: "I'm having trouble connecting right now. Please check your internet connection and try again."
            });
        }

        // Generic error fallback
        console.warn('[GEMINI_DEBUG] Generic error, returning default message');
        return res.json({
            success: true,
            response: "I'm experiencing a technical issue. Please try again in a moment. If the problem persists, contact support."
        });
    }
};

module.exports = { checkHealth, gemeniChat };