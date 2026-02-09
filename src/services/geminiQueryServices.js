// Query classifier - determines if query is simple (code-based) or complex (Gemini)
const classifyQuery = (userText) => {
    if (!userText || typeof userText !== 'string') return { type: 'complex', confidence: 0 };

    const text = userText.toLowerCase().trim();

    // Simple query patterns (handle in code)
    const simplePatterns = [
        // Owner queries
        { pattern: /^(who\s+is\s+the\s+owner|who\s+owns|owner\s+name|group\s+owner|connection\s+owner)/i, type: 'owner' },
        { pattern: /^(tell\s+me\s+the\s+owner|show\s+me\s+the\s+owner|what\s+is\s+the\s+owner)/i, type: 'owner' },

        // Member count queries
        { pattern: /^(how\s+many\s+members|how\s+many\s+people|member\s+count|number\s+of\s+members|total\s+members)/i, type: 'member_count' },
        { pattern: /^(count\s+members|members\s+total|how\s+many\s+in\s+group|how\s+many\s+in\s+connection)/i, type: 'member_count' },

        // Member names queries
        { pattern: /^(list\s+all\s+members|tell\s+names\s+of\s+all\s+members|show\s+all\s+members|all\s+members\s+names)/i, type: 'member_names' },
        { pattern: /^(who\s+are\s+the\s+members|names\s+of\s+members|member\s+list)/i, type: 'member_names' },

        // Connection creation date
        { pattern: /^(when\s+was\s+the\s+connection\s+built|when\s+was\s+group\s+created|connection\s+created|group\s+created|when\s+connection\s+created)/i, type: 'connection_date' },

        // First members
        { pattern: /^(who\s+are\s+the\s+first\s+members|first\s+members|who\s+joined\s+first)/i, type: 'first_members' },

        // Recent joins
        { pattern: /^(who\s+joined\s+recently|who\s+is\s+latest\s+joined|recent\s+joins|latest\s+member)/i, type: 'recent_joins' },

        // Who left
        { pattern: /^(who\s+left|who\s+left\s+the\s+group|members\s+who\s+left|who\s+left\s+connection)/i, type: 'who_left' },

        // Current user info
        { pattern: /^(who\s+am\s+i|who\s+is\s+me|tell\s+me\s+about\s+myself|my\s+info|my\s+details)/i, type: 'current_user' },
        { pattern: /^(what\s+is\s+my\s+nationality|my\s+nationality|what\s+is\s+my\s+phone|my\s+phone\s+number)/i, type: 'current_user' },
        { pattern: /^(what\s+is\s+my\s+name|my\s+name|what\s+is\s+my\s+username|my\s+username)/i, type: 'current_user' },
    ];

    // Check for simple patterns
    for (const { pattern, type } of simplePatterns) {
        if (pattern.test(text)) {
            return { type, confidence: 0.9, queryType: 'simple' };
        }
    }

    // Check for complex queries (multi-part, conversational, location-based)
    const complexIndicators = [
        /\b(and|or|but|also|then|after|before)\b/i, // Multi-part queries
        /\b(why|how|explain|describe|tell\s+me\s+about)\b/i, // Explanatory queries
        /\b(where\s+is|take\s+me|navigate|route|directions|go\s+to)\b/i, // Location/routing queries
        /\b(help|assist|guide|suggest|recommend)\b/i, // Help queries
    ];

    const hasComplexIndicators = complexIndicators.some(pattern => pattern.test(text));

    // If it's clearly a location/routing query, it's complex (needs IntentAgent)
    if (/\b(lost|hotel|bus|station|location|where|navigate|route|directions|go\s+to|take\s+me)\b/i.test(text)) {
        return { type: 'complex', confidence: 0.8, queryType: 'location' };
    }

    // If it matches simple patterns, it's simple
    // Otherwise, it's complex (send to Gemini)
    return {
        type: hasComplexIndicators ? 'complex' : 'simple',
        confidence: hasComplexIndicators ? 0.7 : 0.5,
        queryType: 'general'
    };
};

// Handler for simple queries (code-based)
const handleSimpleQuery = async (queryType, userText, userId, user, activeConnection, activity, memberLocations) => {
    console.warn('[SIMPLE_QUERY] Handling query type:', queryType);

    try {
        switch (queryType) {
            case 'owner':
                if (!activeConnection) {
                    return "You are not currently in any connection or group.";
                }
                const owner = activeConnection.users.find(u => u.role === 'owner' && u.status === 'active');
                if (owner) {
                    const ownerData = owner.userId && typeof owner.userId === 'object' ? owner.userId : null;
                    const ownerName = ownerData?.name || 'Unknown';
                    return `The owner of the group is ${ownerName}.`;
                }
                return "I couldn't find the owner information.";

            case 'member_count':
                if (!activeConnection) {
                    return "You are not currently in any connection or group.";
                }
                const activeMembers = activeConnection.users.filter(u => u.status === 'active');
                const count = activeMembers.length;
                return `There are ${count} ${count === 1 ? 'member' : 'members'} in the connection.`;

            case 'member_names':
                if (!activeConnection) {
                    return "You are not currently in any connection or group.";
                }
                const members = activeConnection.users
                    .filter(u => u.status === 'active')
                    .map(u => {
                        const userData = u.userId && typeof u.userId === 'object' ? u.userId : null;
                        return userData?.name || 'Unknown';
                    });
                if (members.length === 0) {
                    return "There are no active members in the connection.";
                }
                if (members.length === 1) {
                    return `The member is ${members[0]}.`;
                }
                return `The members are: ${members.join(', ')}.`;

            case 'connection_date':
                if (!activeConnection) {
                    return "You are not currently in any connection or group.";
                }
                const createdAt = activeConnection.metadata?.createdAt || activeConnection.createdAt;
                if (createdAt) {
                    const date = new Date(createdAt);
                    return `The connection was created on ${date.toLocaleDateString()}.`;
                }
                return "I couldn't find when the connection was created.";

            case 'first_members':
                if (!activeConnection) {
                    return "You are not currently in any connection or group.";
                }
                const sortedMembers = activeConnection.users
                    .filter(u => u.status === 'active')
                    .sort((a, b) => {
                        const dateA = a.joinedAt ? new Date(a.joinedAt) : new Date(0);
                        const dateB = b.joinedAt ? new Date(b.joinedAt) : new Date(0);
                        return dateA - dateB;
                    })
                    .slice(0, 3) // First 3 members
                    .map(u => {
                        const userData = u.userId && typeof u.userId === 'object' ? u.userId : null;
                        return userData?.name || 'Unknown';
                    });
                if (sortedMembers.length === 0) {
                    return "I couldn't find the first members.";
                }
                return `The first members are: ${sortedMembers.join(', ')}.`;

            case 'recent_joins':
                if (!activity || activity.length === 0) {
                    return "I don't have information about recent joins.";
                }
                const recentJoins = activity
                    .filter(a => a.activityType === 'join_connection')
                    .slice(0, 3)
                    .map(a => a.actor?.name || 'Unknown');
                if (recentJoins.length === 0) {
                    return "No one has joined recently.";
                }
                return `Recently joined: ${recentJoins.join(', ')}.`;

            case 'who_left':
                if (!activity || activity.length === 0) {
                    return "I don't have information about who left.";
                }
                const leftMembers = activity
                    .filter(a => a.activityType === 'leave_connection' || a.activityType === 'remove_user')
                    .slice(0, 5)
                    .map(a => a.target?.name || a.actor?.name || 'Unknown');
                if (leftMembers.length === 0) {
                    return "No one has left the connection.";
                }
                return `Members who left: ${leftMembers.join(', ')}.`;

            case 'current_user':
                if (!user) {
                    return "I couldn't find your information.";
                }
                // Format phone number for TTS - read digit by digit
                const formatPhoneForTTS = (phone) => {
                    if (!phone) return '';
                    // Remove all non-digit characters except + for country code
                    const cleaned = phone.toString().replace(/[^\d+]/g, '');
                    // Split into digits and join with spaces for TTS to read individually
                    const digits = cleaned.replace(/\+/g, 'plus ').split('').join(' ');
                    return digits;
                };
                const details = [];
                if (user.name) details.push(`Name: ${user.name}`);
                if (user.username) details.push(`Username: ${user.username}`);
                if (user.nationality) details.push(`Nationality: ${user.nationality}`);
                if (user.phone) details.push(`Phone: ${formatPhoneForTTS(user.phone)}`);
                if (user.email) details.push(`Email: ${user.email}`);
                if (details.length === 0) {
                    return "I don't have your information available.";
                }
                return `Your details: ${details.join(', ')}.`;

            default:
                return null; // Not handled, send to Gemini
        }
    } catch (error) {
        console.warn('[SIMPLE_QUERY] Error handling query:', error);
        return null; // Fallback to Gemini on error
    }
};

module.exports = {
    classifyQuery,
    handleSimpleQuery
}