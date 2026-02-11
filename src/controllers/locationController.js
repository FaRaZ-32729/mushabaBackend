const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
const Connection = require('../models/connectionSchema');
const { ConnectionLocation } = require('../models/locationSchema');
const User = require('../models/userSchema');


// In-memory storage for user locations (for real-time updates)
const userLocations = {};

// Memory cleanup configuration - PER USER timeout
const MEMORY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes per user


// Helper function to create uploads directory
const createUploadsDirectory = async () => {
    const uploadsDir = path.join(__dirname, '../uploads/locations');
    try {
        await fs.mkdir(uploadsDir, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
};

/**
 * Mark personal location (overrides group for the user)
 */
const markPersonalLocation = async (connection, userId, locationData, files) => {
    const { type, name, latitude, longitude, comment, distance } = locationData;

    // Remove existing personal location of same type
    connection.markedLocations = connection.markedLocations.filter(
        loc => !(loc.scope.type === 'personal' && loc.scope.userId.toString() === userId && loc.type === type)
    );

    // Add new personal location
    const newLocation = {
        type,
        name,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        comment,
        distance: parseFloat(distance) || 0,
        images: files ? files.map(file => file.filename) : [],
        markedBy: userId,
        isOwnerMarked: false,
        isPersonalMarked: true,
        scope: {
            type: 'personal',
            userId: userId,
            isOwnerPersonal: false
        },
        markedAt: new Date(),
        updatedAt: new Date()
    };

    connection.markedLocations.push(newLocation);
    await connection.save();

    console.log(`[PERSONAL_MARK] Marked personal ${type} for user ${userId}`);
};

/**
 * Mark group location (owner's choice for all members)
 */ // done
const markGroupLocation = async (connection, userId, locationData, files) => {
    const { type, name, latitude, longitude, comment, distance } = locationData;

    // Remove existing group location of same type
    connection.markedLocations = connection.markedLocations.filter(
        loc => !(loc.scope.type === 'group' && loc.type === type)
    );

    // Add new group location
    const newLocation = {
        type,
        name,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        comment,
        distance: parseFloat(distance) || 0,
        images: files ? files.map(file => file.filename) : [],
        markedBy: userId,
        isOwnerMarked: true,
        isPersonalMarked: false,
        scope: {
            type: 'group',
            userId: null,
            isOwnerPersonal: true // Owner's group location is also their personal
        },
        markedAt: new Date(),
        updatedAt: new Date()
    };

    connection.markedLocations.push(newLocation);
    await connection.save();

    console.log(`[GROUP_MARK] Marked group ${type} by owner ${userId}`);
};

/**
 * Sync all users' cache for a connection
 */
const syncAllUsersCache = async (connectionId) => {
    try {
        const connection = await Connection.findById(connectionId);
        if (!connection) return;

        const groupLocations = connection.markedLocations.filter(loc => loc.scope.type === 'group');
        const busLocation = groupLocations.find(loc => loc.type === 'bus_station');
        const hotelLocation = groupLocations.find(loc => loc.type === 'hotel');

        // Update all users in the connection
        for (const userInConnection of connection.users) {
            const userId = userInConnection.userId;
            const isOwner = userInConnection.role === 'owner';

            // Get user's personal locations
            const personalLocations = connection.markedLocations.filter(loc =>
                loc.scope.type === 'personal' && loc.scope.userId.toString() === userId.toString()
            );
            const personalBus = personalLocations.find(loc => loc.type === 'bus_station');
            const personalHotel = personalLocations.find(loc => loc.type === 'hotel');

            // Determine active locations based on priority
            const activeBus = personalBus || busLocation;
            const activeHotel = personalHotel || hotelLocation;

            // Update user's cache
            await User.findByIdAndUpdate(userId, {
                $set: {
                    'activeLocations.busStation': {
                        name: activeBus?.name || "Unmarked",
                        latitude: activeBus?.latitude || null,
                        longitude: activeBus?.longitude || null,
                        source: personalBus ? 'personal' : (busLocation ? 'group' : 'unmarked'),
                        locationId: activeBus?._id || null,
                        connectionId: connectionId,
                        isMarked: !!activeBus,
                        lastUpdated: new Date()
                    },
                    'activeLocations.hotel': {
                        name: activeHotel?.name || "Unmarked",
                        roomNumber: activeHotel?.roomNumber || null,
                        latitude: activeHotel?.latitude || null,
                        longitude: activeHotel?.longitude || null,
                        source: personalHotel ? 'personal' : (hotelLocation ? 'group' : 'unmarked'),
                        locationId: activeHotel?._id || null,
                        connectionId: connectionId,
                        isMarked: !!activeHotel,
                        lastUpdated: new Date()
                    }
                }
            });
        }

        console.log(`[CACHE_SYNC] Updated cache for all users in connection ${connectionId}`);

    } catch (error) {
        console.error('[CACHE_SYNC] Error:', error);
    }
};

/**
 * Mark a location (enhanced with personal/group logic)
 */
const markLocation = async (req, res) => {
    try {
        await createUploadsDirectory();

        const {
            connectionId,
            type,
            name,
            latitude,
            longitude,
            comment,
            distance,
            isPersonal
        } = req.body;

        // Convert string to boolean for FormData
        const isPersonalMarking = isPersonal === 'true' || isPersonal === true;
        const userId = req.user.id;

        console.log('[ENHANCED_MARK_LOCATION] Request received:', {
            connectionId,
            type,
            name,
            latitude,
            longitude,
            comment,
            distance,
            userId,
            isPersonal: isPersonalMarking
        });

        // Validate required fields
        if (!connectionId || !type || !name || !latitude || !longitude || !comment) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Validate images upload (optional, but if provided, max 1 image)
        if (req.files && req.files.length > 1) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 1 image allowed'
            });
        }

        // Find the connection
        const connection = await Connection.findById(connectionId);
        if (!connection) {
            return res.status(404).json({
                success: false,
                message: 'Connection not found'
            });
        }

        // Verify user is in connection
        const userInConnection = connection.users.find(
            u => u.userId.toString() === userId && u.status === 'active'
        );
        if (!userInConnection) {
            return res.status(403).json({
                success: false,
                message: 'User not found in connection'
            });
        }

        const isOwner = userInConnection.role === 'owner';

        // Process marking based on type and user role
        if (isPersonalMarking) {
            // Personal marking - both owner and members can do this
            await markPersonalLocation(connection, userId, req.body, req.files);
        } else {
            // Group marking - only owner allowed
            if (!isOwner) {
                return res.status(403).json({
                    success: false,
                    message: 'Only connection owner can mark group locations'
                });
            }
            await markGroupLocation(connection, userId, req.body, req.files);
        }

        // Sync to all users' cache
        await syncAllUsersCache(connectionId);

        res.json({
            success: true,
            message: 'Location marked successfully',
            isPersonal,
            isOwner
        });

    } catch (error) {
        console.error('[ENHANCED_MARK_LOCATION] Error:', error);

        // Clean up uploaded files if there was an error
        if (req.files && req.files.length > 0) {
            try {
                await Promise.all(req.files.map(file => fs.unlink(file.path)));
            } catch (unlinkError) {
                console.error('[ENHANCED_MARK_LOCATION] Error deleting files:', unlinkError);
            }
        }

        res.status(500).json({
            success: false,
            message: 'Failed to mark location'
        });
    }
};

/**
 * Get active locations for a user based on priority
 */
const getActiveLocationsForUser = (connection, userId, isOwner) => {
    const locations = [];

    // For each location type (bus_station, hotel)
    ['bus_station', 'hotel'].forEach(type => {
        const personalLocation = connection.markedLocations.find(loc =>
            loc.scope.type === 'personal' &&
            loc.scope.userId.toString() === userId &&
            loc.type === type
        );

        const groupLocation = connection.markedLocations.find(loc =>
            loc.scope.type === 'group' && loc.type === type
        );

        let activeLocation;
        if (isOwner) {
            // Owner always sees group location (which is their personal too)
            if (groupLocation) {
                activeLocation = {
                    _id: groupLocation._id,
                    type: groupLocation.type,
                    name: groupLocation.name,
                    latitude: groupLocation.latitude,
                    longitude: groupLocation.longitude,
                    comment: groupLocation.comment,
                    distance: groupLocation.distance,
                    images: groupLocation.images,
                    markedBy: groupLocation.markedBy,
                    markedAt: groupLocation.markedAt,
                    updatedAt: groupLocation.updatedAt,
                    source: 'group',
                    isMarked: true
                };
            } else {
                activeLocation = {
                    name: "Unmarked",
                    source: "unmarked",
                    isMarked: false
                };
            }
        } else {
            // Member priority: Personal > Group > Unmarked
            if (personalLocation) {
                activeLocation = {
                    _id: personalLocation._id,
                    type: personalLocation.type,
                    name: personalLocation.name,
                    latitude: personalLocation.latitude,
                    longitude: personalLocation.longitude,
                    comment: personalLocation.comment,
                    distance: personalLocation.distance,
                    images: personalLocation.images,
                    markedBy: personalLocation.markedBy,
                    markedAt: personalLocation.markedAt,
                    updatedAt: personalLocation.updatedAt,
                    source: 'personal',
                    isMarked: true
                };
            } else if (groupLocation) {
                activeLocation = {
                    _id: groupLocation._id,
                    type: groupLocation.type,
                    name: groupLocation.name,
                    latitude: groupLocation.latitude,
                    longitude: groupLocation.longitude,
                    comment: groupLocation.comment,
                    distance: groupLocation.distance,
                    images: groupLocation.images,
                    markedBy: groupLocation.markedBy,
                    markedAt: groupLocation.markedAt,
                    updatedAt: groupLocation.updatedAt,
                    source: 'group',
                    isMarked: true
                };
            } else {
                activeLocation = {
                    name: "Unmarked",
                    source: "unmarked",
                    isMarked: false
                };
            }
        }

        locations.push(activeLocation);
    });

    return locations;
};

/**
 * Get marked locations for a connection (with priority logic)
 */
const getMarkedLocationEnhanced = async (req, res) => {
    try {
        const { connectionId } = req.params;
        const userId = req.user.id;

        const connection = await Connection.findById(connectionId);
        if (!connection) {
            return res.status(404).json({
                success: false,
                message: 'Connection not found'
            });
        }

        // Verify user is in connection
        const userInConnection = connection.users.find(
            u => u.userId.toString() === userId && u.status === 'active'
        );
        if (!userInConnection) {
            return res.status(403).json({
                success: false,
                message: 'User not found in connection'
            });
        }

        const isOwner = userInConnection.role === 'owner';

        // Get active locations based on priority
        const activeLocations = getActiveLocationsForUser(connection, userId, isOwner);

        res.json({
            success: true,
            locations: activeLocations,
            isOwner
        });

    } catch (error) {
        console.error('[GET_MARKED_LOCATIONS] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get marked locations'
        });
    }
};

/**
 * Use personal location as group location
 */
const usePersonalAsGroup = async (connection, newOwnerId, type) => {
    // Find new owner's personal location
    const personalLocation = connection.markedLocations.find(loc =>
        loc.scope.type === 'personal' &&
        loc.scope.userId.toString() === newOwnerId &&
        loc.type === type
    );

    if (personalLocation) {
        // Remove old group location
        connection.markedLocations = connection.markedLocations.filter(
            loc => !(loc.scope.type === 'group' && loc.type === type)
        );

        // Convert personal to group
        personalLocation.scope.type = 'group';
        personalLocation.scope.userId = null;
        personalLocation.markedBy = newOwnerId;
        personalLocation.isOwnerMarked = true;
        personalLocation.isPersonalMarked = false;
        personalLocation.updatedAt = new Date();
    }
};

/**
 * Keep previous group location
 */
const keepPreviousAsGroup = async (connection, newOwnerId, type) => {
    // Remove new owner's personal location
    connection.markedLocations = connection.markedLocations.filter(
        loc => !(loc.scope.type === 'personal' && loc.scope.userId.toString() === newOwnerId && loc.type === type)
    );

    // Update group location ownership
    const groupLocation = connection.markedLocations.find(loc =>
        loc.scope.type === 'group' && loc.type === type
    );

    if (groupLocation) {
        groupLocation.markedBy = newOwnerId;
        groupLocation.updatedAt = new Date();
    }
};

/**
 * Handle ownership transfer with conflict resolution
 */
const handleOwnershipTransfer = async (req, res) => {
    try {
        const { connectionId, newOwnerId, choices } = req.body;
        const currentUserId = req.user.id;

        const connection = await Connection.findById(connectionId);
        if (!connection) {
            return res.status(404).json({
                success: false,
                message: 'Connection not found'
            });
        }

        // Verify current user is owner
        const currentUser = connection.users.find(u => u.userId.toString() === currentUserId);
        if (!currentUser || currentUser.role !== 'owner') {
            return res.status(403).json({
                success: false,
                message: 'Only current owner can transfer ownership'
            });
        }

        // Process choices for each location type
        if (choices.bus === 'personal') {
            await usePersonalAsGroup(connection, newOwnerId, 'bus_station');
        } else {
            await keepPreviousAsGroup(connection, newOwnerId, 'bus_station');
        }

        if (choices.hotel === 'personal') {
            await usePersonalAsGroup(connection, newOwnerId, 'hotel');
        } else {
            await keepPreviousAsGroup(connection, newOwnerId, 'hotel');
        }

        // Update roles
        currentUser.role = 'member';
        const newOwner = connection.users.find(u => u.userId.toString() === newOwnerId);
        if (newOwner) {
            newOwner.role = 'owner';
        }

        await connection.save();

        // Sync all users' cache
        await syncAllUsersCache(connectionId);

        res.json({
            success: true,
            message: 'Ownership transferred successfully',
            choices
        });

    } catch (error) {
        console.error('[OWNERSHIP_TRANSFER] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to transfer ownership'
        });
    }
};

// NEW: Check if user should be in memory or database fallback
const shouldUseMemoryForUser = (userId) => {
    const userLocation = userLocations[userId];
    if (!userLocation) return false;

    const timeSinceUpdate = Date.now() - userLocation.lastUpdated;
    return timeSinceUpdate <= MEMORY_TIMEOUT_MS;
};

// NEW: Ensure ConnectionLocation document exists for a connection
const ensureConnectionLocationExists = async (connectionId) => {
    console.log('[ENSURE_CONNECTION] Checking if ConnectionLocation document exists for:', connectionId);

    try {
        const existingDoc = await ConnectionLocation.findOne({ connectionId: connectionId });

        if (!existingDoc) {
            console.log('[ENSURE_CONNECTION] Document does not exist, creating new one...');

            // Get connection details to initialize the document
            const connection = await Connection.findById(connectionId);
            if (!connection) {
                throw new Error('Connection not found');
            }

            const newDoc = new ConnectionLocation({
                connectionId: connectionId,
                users: [],
                connectionStats: {
                    activeUsers: 0,
                    totalLocations: 0,
                    lastActivity: new Date(),
                    totalUsers: connection.users.length
                }
            });

            await newDoc.save();
            console.log('[ENSURE_CONNECTION] New ConnectionLocation document created:', newDoc._id);
            return newDoc;
        } else {
            console.log('[ENSURE_CONNECTION] Document already exists:', existingDoc._id);
            return existingDoc;
        }
    } catch (error) {
        console.error('[ENSURE_CONNECTION] Error ensuring document exists:', error);
        throw error;
    }
};

// NEW: Add new user to connection if they don't exist
const addNewUserToConnection = async (userId, connectionId, locationData) => {
    console.log('[ADD_NEW_USER] Adding new user to connection:', userId, 'connection:', connectionId);

    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        console.log('[ADD_NEW_USER] User found:', user.name);

        const newUserData = {
            userId: userId,
            currentLocation: {
                latitude: locationData.latitude,
                longitude: locationData.longitude,
                floor: locationData.floor || null,
                lastUpdated: new Date(),
                online: true
            },
            locationHistory: [{
                latitude: locationData.latitude,
                longitude: locationData.longitude,
                floor: locationData.floor || null,
                timestamp: new Date(),
                accuracy: locationData.accuracy || null,
                speed: locationData.speed || null,
                heading: locationData.heading || null
            }],
            stats: {
                totalLocations: 1,
                lastActive: new Date(),
                averageSpeed: locationData.speed || 0,
                totalDistance: 0
            }
        };

        console.log('[ADD_NEW_USER] New user data prepared:', newUserData);

        // Add user to connection using $push (document should exist now)
        const updateResult = await ConnectionLocation.updateOne(
            { connectionId: connectionId },
            {
                $push: { users: newUserData },
                $set: {
                    'connectionStats.lastActivity': new Date()
                },
                $inc: {
                    'connectionStats.totalLocations': 1
                }
            }
        );

        console.log('[ADD_NEW_USER] MongoDB update result for new user:', updateResult);
        console.log('[ADD_NEW_USER] Upserted ID:', updateResult.upsertedId);
        console.log('[ADD_NEW_USER] New user added to connection successfully:', userId);

    } catch (error) {
        console.error('[ADD_NEW_USER] Error adding new user:', error);
        console.error('[ADD_NEW_USER] Error message:', error.message);
        console.error('[ADD_NEW_USER] Error stack:', error.stack);
        throw error;
    }
};

// NEW: Update connection stats after user location update
const updateConnectionStats = async (connectionId) => {
    try {
        const connection = await ConnectionLocation.findOne({ connectionId });
        if (!connection) return;

        const activeUsers = connection.users.filter(u => u.currentLocation.online).length;
        const totalLocations = connection.users.reduce((sum, u) => sum + u.stats.totalLocations, 0);

        await ConnectionLocation.updateOne(
            { connectionId: connectionId },
            {
                $set: {
                    'connectionStats.activeUsers': activeUsers,
                    'connectionStats.totalLocations': totalLocations
                }
            }
        );

    } catch (error) {
        console.error('[UPDATE_CONNECTION_STATS] Error:', error);
    }
};

// NEW: Update specific user location in connection document (efficient array update)
const updateUserLocationInConnectionDB = async (userId, connectionId, locationData) => {
    console.log('[UPDATE_USER_LOCATION_DB] Starting database update for user:', userId, 'connection:', connectionId);
    console.log('[UPDATE_USER_LOCATION_DB] Location data:', locationData);

    try {
        // Check if ConnectionLocation model is available
        console.log('[UPDATE_USER_LOCATION_DB] ConnectionLocation model available:', !!ConnectionLocation);

        // Ensure the ConnectionLocation document exists
        await ensureConnectionLocationExists(connectionId);

        // Use MongoDB's array update operators to update only the specific user
        console.log('[UPDATE_USER_LOCATION_DB] Executing MongoDB update operation...');

        const updateResult = await ConnectionLocation.updateOne(
            {
                connectionId: connectionId,
                'users.userId': userId
            },
            {
                $set: {
                    'users.$.currentLocation': {
                        latitude: locationData.latitude,
                        longitude: locationData.longitude,
                        floor: locationData.floor || null,
                        lastUpdated: new Date(),
                        online: true
                    },
                    'users.$.stats.lastActive': new Date()
                },
                $push: {
                    'users.$.locationHistory': {
                        $each: [{
                            latitude: locationData.latitude,
                            longitude: locationData.longitude,
                            floor: locationData.floor || null,
                            timestamp: new Date(),
                            accuracy: locationData.accuracy || null,
                            speed: locationData.speed || null,
                            heading: locationData.heading || null
                        }],
                        $slice: -5 // Keep only last 100 entries
                    }
                },
                $inc: {
                    'users.$.stats.totalLocations': 1,
                    'connectionStats.totalLocations': 1
                },
                $set: {
                    'connectionStats.lastActivity': new Date()
                }
            }
        );

        console.log('[UPDATE_USER_LOCATION_DB] MongoDB update result:', updateResult);
        console.log('[UPDATE_USER_LOCATION_DB] Matched count:', updateResult.matchedCount);
        console.log('[UPDATE_USER_LOCATION_DB] Modified count:', updateResult.modifiedCount);

        // If user doesn't exist in the connection yet, add them
        if (updateResult.matchedCount === 0) {
            console.log('[UPDATE_USER_LOCATION_DB] User not found in connection, adding new user...');
            await addNewUserToConnection(userId, connectionId, locationData);
        } else {
            console.log('[UPDATE_USER_LOCATION_DB] User updated successfully, updating connection stats...');
            // Update connection stats for existing user
            await updateConnectionStats(connectionId);
        }

        console.log('[UPDATE_USER_LOCATION_DB] Database update completed successfully for user:', userId);

    } catch (error) {
        console.error('[UPDATE_USER_LOCATION_DB] Error updating user location:', error);
        console.error('[UPDATE_USER_LOCATION_DB] Error message:', error.message);
        console.error('[UPDATE_USER_LOCATION_DB] Error stack:', error.stack);
        throw error;
    }
};

// Update user location in memory AND database (ENHANCED with automatic memory promotion)
const updateUserLocation = async (userId, locationData, connectionId = null) => {
    // console.log('[UPDATE_USER_LOCATION] Updating location for user:', userId, 'with data:', locationData);
    // console.log('[UPDATE_USER_LOCATION] ConnectionId received:', connectionId);

    try {
        // Check if user was previously in database fallback mode
        const wasInDatabaseFallback = !userLocations[userId] || !shouldUseMemoryForUser(userId);

        // 1. Update in-memory cache (this automatically promotes user back to memory)
        userLocations[userId] = {
            ...locationData,
            lastUpdated: Date.now(),
            online: true
        };

        if (wasInDatabaseFallback) {
            console.log(`[UPDATE_USER_LOCATION] User ${userId} promoted back to memory from database fallback`);
        } else {
            console.log(`[UPDATE_USER_LOCATION] User ${userId} updated in memory (was already active)`);
        }

        // console.log('[UPDATE_USER_LOCATION] Updated userLocations object:', Object.keys(userLocations));
        // console.log('[UPDATE_USER_LOCATION] User location stored:', userLocations[userId]);

        // 2. Update database with connectionId from frontend (more efficient)
        if (connectionId) {
            console.log('[UPDATE_USER_LOCATION] Attempting database storage with connectionId:', connectionId);
            await updateUserLocationInConnectionDB(userId, connectionId, locationData);
            console.log('[UPDATE_USER_LOCATION] Location stored in database with connectionId:', connectionId);
        } else {
            console.log('[UPDATE_USER_LOCATION] No connectionId provided, skipping database storage');
        }

        // 3. Broadcast location update to all users in the connection via socket
        if (connectionId && global.io) {
            try {
                const broadcastData = {
                    userId: userId,
                    latitude: locationData.latitude || locationData.lat,
                    longitude: locationData.longitude || locationData.lng,
                    online: true,
                    lastUpdated: userLocations[userId].lastUpdated,
                    connectionId: connectionId
                };

                console.log('[SOCKET_BROADCAST] Broadcasting location update:', broadcastData);
                console.log('[SOCKET_DEBUG] Global IO instance available:', !!global.io);
                console.log('[SOCKET_DEBUG] Global IO engine clients count:', global.io?.engine?.clientsCount);
                global.io.to(`connection:${connectionId}`).emit('locationUpdate', broadcastData);
                console.log('[SOCKET_BROADCAST] Location update broadcasted successfully');
            } catch (socketError) {
                console.error('[SOCKET_BROADCAST] Error broadcasting location update:', socketError);
            }
        } else {
            console.log('[SOCKET_BROADCAST] Skipping broadcast - no connectionId or io not available');
        }

    } catch (error) {
        console.error('[UPDATE_USER_LOCATION] Database update failed, but memory update succeeded:', error);
        console.error('[UPDATE_USER_LOCATION] Error details:', error.message);
        console.error('[UPDATE_USER_LOCATION] Error stack:', error.stack);
        // Continue with memory update even if DB fails (backward compatibility)
    }

    return userLocations[userId];
};

// Update user location (for real-time tracking)
const updateUserLocationForRTT = async (req, res) => {
    try {
        const { latitude, longitude, connectionId } = req.body;
        const userId = req.user.id; // Fixed: use req.user.id instead of req.user.userId

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        // ENHANCED: Now updates both memory and database
        const updatedLocation = await updateUserLocation(userId, {
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            timestamp: Date.now()
        }, connectionId); // Pass connectionId for database storage

        res.json({
            success: true,
            message: 'Location updated successfully',
            location: updatedLocation
        });
    } catch (error) {
        console.error('[LOCATION_UPDATE] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update location'
        });
    }
};

// Get marked locations for a connection
const getMarkedLocations = async (req, res) => {
    try {
        const { connectionId } = req.params;
        const userId = req.user.id; // Changed from req.user.userId to req.user.id

        // Find the connection and verify user has access
        const connection = await Connection.findById(connectionId);
        if (!connection) {
            return res.status(404).json({
                success: false,
                message: 'Connection not found'
            });
        }

        // Check if user is part of the connection
        const userInConnection = connection.users.find(
            user => user.userId.toString() === userId
        );

        if (!userInConnection) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Return marked locations with full image URLs
        const locations = (connection.markedLocations || []).map(location => ({
            ...location.toObject(),
            images: location.images.map(img => `/uploads/locations/${img}`)
        }));

        res.json({
            success: true,
            locations
        });

    } catch (error) {
        console.error('[GET_MARKED_LOCATIONS] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch marked locations'
        });
    }
};

// Update a marked location
const updateMarkedLocation = async (req, res) => {
    try {
        const { locationId } = req.params;
        const { comment } = req.body;
        const userId = req.user.id; // Changed from req.user.userId to req.user.id

        // Find connection containing the location
        const connection = await Connection.findOne({
            'markedLocations._id': locationId
        });

        if (!connection) {
            return res.status(404).json({
                success: false,
                message: 'Location not found'
            });
        }

        // Owner validation removed - handled in frontend
        console.log('[UPDATE_LOCATION] Owner validation skipped - handled in frontend');

        // Find and update the location
        const location = connection.markedLocations.id(locationId);
        if (!location) {
            return res.status(404).json({
                success: false,
                message: 'Location not found'
            });
        }

        // Update comment if provided
        if (comment !== undefined) {
            location.comment = comment;
        }

        // Update images if provided
        console.log('[UPDATE_LOCATION] Files received:', req.files ? req.files.length : 0);
        console.log('[UPDATE_LOCATION] Current images:', location.images);

        if (req.files && req.files.length > 0) {
            // Delete old images
            try {
                await Promise.all(location.images.map(img =>
                    fs.unlink(path.join('uploads/locations', img))
                ));
            } catch (error) {
                console.log('[UPDATE_LOCATION] Could not delete old images:', error.message);
            }

            location.images = req.files.map(file => file.filename);
            console.log('[UPDATE_LOCATION] Updated images to:', location.images);
        } else {
            console.log('[UPDATE_LOCATION] No new images, keeping existing:', location.images);
        }
        // If no new images provided, keep existing images (don't change anything)

        location.updatedAt = new Date();
        await connection.save();

        // Emit real-time event for bus/hotel marker updates (following creation pattern)
        const io = req.app.get('io');
        if (io) {
            const updatedMarker = {
                _id: location._id,
                type: location.type,
                name: location.name,
                lat: location.latitude,  // Map latitude to lat for frontend compatibility
                lng: location.longitude, // Map longitude to lng for frontend compatibility
                latitude: location.latitude,  // Keep both for compatibility
                longitude: location.longitude,
                comment: location.comment,
                images: location.images.map(img => `/uploads/locations/${img}`),
                markedBy: location.markedBy,
                markedAt: location.markedAt,
                updatedAt: location.updatedAt
            };

            console.log('[BUS_HOTEL_REALTIME] Emitting busHotelMarkerUpdated event from backend:', {
                connectionId: connection._id,
                marker: updatedMarker
            });

            io.to(`connection:${connection._id}`).emit('busHotelMarkerUpdated', {
                marker: updatedMarker
            });
        } else {
            console.log('[BUS_HOTEL_REALTIME] IO instance not available for real-time update');
        }

        res.json({
            success: true,
            message: 'Location updated successfully',
            imageUrls: location.images.map(img => `/uploads/locations/${img}`),
            location
        });

    } catch (error) {
        console.error('[UPDATE_LOCATION] Error:', error);

        // Clean up uploaded files if there was an error
        if (req.files && req.files.length > 0) {
            try {
                await Promise.all(req.files.map(file => fs.unlink(file.path)));
            } catch (unlinkError) {
                console.error('[UPDATE_LOCATION] Error deleting files:', unlinkError);
            }
        }

        res.status(500).json({
            success: false,
            message: 'Failed to update location'
        });
    }
};

// Delete a marked location (personal or group)
const deleteMarkedLocation = async (req, res) => {
    try {
        const { locationId } = req.params;
        const userId = req.user.id;

        console.log('[ENHANCED_DELETE_LOCATION] Request received:', {
            locationId,
            userId
        });

        // Find the location in the database
        const location = await ConnectionLocation.findById(locationId);
        if (!location) {
            return res.status(404).json({
                success: false,
                message: 'Location not found'
            });
        }

        // Check if user has permission to delete
        const canDelete = location.markedBy.toString() === userId.toString();
        if (!canDelete) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete locations you marked'
            });
        }

        // Delete the location
        await ConnectionLocation.findByIdAndDelete(locationId);

        // Find the connection to update user cache
        const connection = await Connection.findOne({
            'markedLocations.busStation': locationId
        }) || await Connection.findOne({
            'markedLocations.hotel': locationId
        });

        if (connection) {
            // Update connection's markedLocations
            if (connection.markedLocations.busStation?.toString() === locationId) {
                connection.markedLocations.busStation = null;
            }
            if (connection.markedLocations.hotel?.toString() === locationId) {
                connection.markedLocations.hotel = null;
            }
            await connection.save();

            // Update all users' activeLocations cache
            await syncAllUsersCache(connection._id);
        }

        // Update user's activeLocations if it's a personal location
        await User.updateMany(
            { 'activeLocations.busStation': locationId },
            { $unset: { 'activeLocations.busStation': 1 } }
        );
        await User.updateMany(
            { 'activeLocations.hotel': locationId },
            { $unset: { 'activeLocations.hotel': 1 } }
        );

        res.json({
            success: true,
            message: 'Location deleted successfully',
            locationType: location.type
        });

    } catch (error) {
        console.error('[ENHANCED_DELETE_LOCATION] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete location',
            error: error.message
        });
    }
};

// Mark user as offline (ENHANCED)
const markUserOffline = async (userId) => {
    try {
        // Update memory (keep existing behavior)
        if (userLocations[userId]) {
            userLocations[userId].online = false;
            userLocations[userId].lastUpdated = Date.now();
        }

        // NEW: Also update database
        const connections = await Connection.find({
            'users.userId': userId,
            'users.status': 'active',
            'metadata.status': 'active'
        });

        for (const connection of connections) {
            await ConnectionLocation.updateOne(
                {
                    connectionId: connection._id,
                    'users.userId': userId
                },
                {
                    $set: {
                        'users.$.currentLocation.online': false,
                        'users.$.currentLocation.lastUpdated': new Date(),
                        'users.$.stats.lastActive': new Date()
                    }
                }
            );

            // Update connection stats
            await updateConnectionStats(connection._id);
        }

        return userLocations[userId];

    } catch (error) {
        console.error('[MARK_USER_OFFLINE] Database update failed, but memory update succeeded:', error);
        return userLocations[userId];
    }
};

// Mark user as offline
const markOfflineUser = (req, res) => {
    try {
        const userId = req.user.id; // Fixed: use req.user.id instead of req.user.userId
        const updatedLocation = locationController.markUserOffline(userId);

        res.json({
            success: true,
            message: 'User marked as offline',
            location: updatedLocation
        });
    } catch (error) {
        console.error('[OFFLINE_ROUTE] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark user as offline'
        });
    }
};

// NEW: Get user location with intelligent source selection
const getUserLocationWithFallback = async (userId) => {
    // First check if user has fresh data in memory
    if (shouldUseMemoryForUser(userId)) {
        console.log(`[LOCATION_SOURCE] User ${userId} using memory (fresh data)`);
        return {
            location: userLocations[userId],
            source: 'memory',
            isStale: false
        };
    }

    // If not in memory or stale, try database
    try {
        const connectionLocation = await ConnectionLocation.findOne({
            'users.userId': userId
        });

        if (connectionLocation) {
            const userInConnection = connectionLocation.users.find(
                user => user.userId.toString() === userId
            );

            if (userInConnection && userInConnection.currentLocation) {
                const dbLocation = userInConnection.currentLocation;
                const isStale = Date.now() - new Date(dbLocation.lastUpdated).getTime() > MEMORY_TIMEOUT_MS;

                console.log(`[LOCATION_SOURCE] User ${userId} using database (${isStale ? 'stale' : 'recent'} data)`);
                return {
                    location: {
                        latitude: dbLocation.latitude,
                        longitude: dbLocation.longitude,
                        floor: dbLocation.floor,
                        lastUpdated: dbLocation.lastUpdated,
                        online: dbLocation.online
                    },
                    source: 'database',
                    isStale: isStale
                };
            }
        }
    } catch (dbError) {
        console.log(`[LOCATION_SOURCE] Database lookup failed for user ${userId}:`, dbError.message);
    }

    console.log(`[LOCATION_SOURCE] User ${userId} no location data found`);
    return null;
};

// Get all user locations in a group connection (ENHANCED with hybrid data)
const getGroupLocations = async (req, res) => {
    try {
        const { connectionId } = req.params;
        const currentUserId = req.user.id;

        console.log('[GROUP_LOCATIONS] Fetching locations for connection:', connectionId, 'by user:', currentUserId);

        // Find the connection
        const connection = await Connection.findById(connectionId);
        if (!connection) {
            return res.status(404).json({
                success: false,
                message: 'Connection not found'
            });
        }

        // Check if current user is part of this connection
        const isUserInConnection = connection.users.some(user =>
            user.userId.toString() === currentUserId.toString()
        );

        if (!isUserInConnection) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: User not part of this connection'
            });
        }

        // HYBRID APPROACH: Combine real-time (memory) and persistent (database) data
        const userIds = connection.users.map(user => user.userId);
        const users = await User.find({ _id: { $in: userIds } });

        // Get real-time locations from memory (most current)
        const realTimeLocations = {};
        userIds.forEach(userId => {
            const userLocation = userLocations[userId.toString()];
            if (userLocation) {
                realTimeLocations[userId.toString()] = userLocation;
            }
        });

        // Get persistent locations from database (fallback)
        let databaseLocations = {};
        try {
            const connectionLocation = await ConnectionLocation.findOne({ connectionId })
                .populate('users.userId', 'name username image');

            if (connectionLocation && connectionLocation.users.length > 0) {
                connectionLocation.users.forEach(user => {
                    const userId = user.userId._id.toString();
                    if (user.currentLocation && user.currentLocation.latitude && user.currentLocation.longitude) {
                        databaseLocations[userId] = {
                            latitude: user.currentLocation.latitude,
                            longitude: user.currentLocation.longitude,
                            floor: user.currentLocation.floor,
                            online: user.currentLocation.online,
                            lastUpdated: user.currentLocation.lastUpdated,
                            source: 'database'
                        };
                    }
                });
                console.log('[GROUP_LOCATIONS] Database locations found:', Object.keys(databaseLocations).length);
            }
        } catch (dbError) {
            console.log('[GROUP_LOCATIONS] Database query failed, using memory only:', dbError.message);
        }

        // Combine data: use intelligent source selection for each user
        const locations = [];

        for (const user of users) {
            const userId = user._id.toString();

            // Use the new intelligent source selection function
            const locationData = await getUserLocationWithFallback(userId);

            if (locationData && locationData.location) {
                const finalLocation = {
                    userId: user._id,
                    name: user.name,
                    avatar: user.image,
                    latitude: locationData.location.latitude,
                    longitude: locationData.location.longitude,
                    floor: locationData.location.floor || null,
                    online: locationData.location.online || true,
                    lastUpdated: locationData.location.lastUpdated,
                    source: locationData.source,
                    isStale: locationData.isStale
                };

                locations.push(finalLocation);
                console.log(`[GROUP_LOCATIONS] User: ${user.name}, Source: ${locationData.source}, Stale: ${locationData.isStale}`);
            } else {
                console.log(`[GROUP_LOCATIONS] User: ${user.name}, No location data found`);
            }
        }

        console.log('[GROUP_LOCATIONS] Final result - Total locations:', locations.length);
        console.log('[GROUP_LOCATIONS] Sources breakdown:', {
            realtime: locations.filter(l => l.source === 'realtime').length,
            database: locations.filter(l => l.source === 'database').length,
            stale: locations.filter(l => l.isStale).length
        });

        res.json({
            success: true,
            locations,
            source: 'hybrid',
            connectionId,
            totalUsers: users.length,
            activeUsers: locations.length,
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error('[GROUP_LOCATIONS] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch group locations'
        });
    }
};

// Test endpoint to check database connectivity and model
const testDB = async (req, res) => {
    try {

        // Test basic model functionality
        const testResult = {
            modelExists: !!ConnectionLocation,
            modelName: ConnectionLocation?.modelName,
            modelType: typeof ConnectionLocation,
            timestamp: new Date().toISOString()
        };

        // Test database connection by counting documents
        if (ConnectionLocation) {
            try {
                const count = await ConnectionLocation.countDocuments();
                testResult.documentCount = count;
                testResult.databaseConnected = true;
            } catch (dbError) {
                testResult.databaseConnected = false;
                testResult.databaseError = dbError.message;
            }
        }

        res.json({
            success: true,
            message: 'Database test completed',
            result: testResult
        });
    } catch (error) {
        console.error('[TEST_DB] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Database test failed',
            error: error.message
        });
    }
};

// NEW: Get connection location history and analytics
const getConnectionLocationHistory = async (req, res) => {
    try {
        const { connectionId } = req.params;
        const { hours = 24, includeHistory = false } = req.query;
        const currentUserId = req.user.id;

        // Verify user has access to this connection
        const connection = await Connection.findById(connectionId);
        if (!connection) {
            return res.status(404).json({
                success: false,
                message: 'Connection not found'
            });
        }

        const isUserInConnection = connection.users.some(user =>
            user.userId.toString() === currentUserId.toString()
        );

        if (!isUserInConnection) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: User not part of this connection'
            });
        }

        // Get connection location aggregate
        const connectionLocation = await ConnectionLocation.findOne({ connectionId })
            .populate('users.userId', 'name username image');

        if (!connectionLocation) {
            return res.json({
                success: true,
                connectionId,
                users: [],
                stats: {
                    lastActivity: null,
                    activeUsers: 0,
                    totalLocations: 0
                }
            });
        }

        // Filter by time if specified
        let filteredUsers = connectionLocation.users;
        if (hours && hours !== 'all') {
            const timeThreshold = new Date(Date.now() - (parseInt(hours) * 60 * 60 * 1000));
            filteredUsers = connectionLocation.users.map(user => ({
                ...user.toObject(),
                locationHistory: user.locationHistory.filter(loc =>
                    new Date(loc.timestamp) >= timeThreshold
                )
            }));
        }

        // Format response
        const response = {
            connectionId,
            users: filteredUsers.map(user => ({
                userId: user.userId._id,
                name: user.userId.name,
                avatar: user.userId.image,
                currentLocation: user.currentLocation,
                stats: user.stats,
                locationHistory: includeHistory === 'true' ? user.locationHistory : undefined
            })),
            stats: connectionLocation.connectionStats
        };

        res.json({
            success: true,
            ...response
        });

    } catch (error) {
        console.error('[GET_CONNECTION_LOCATION_HISTORY] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch connection location history'
        });
    }
};

// NEW: Clean up old location data (maintenance function)
const cleanupOldLocations = async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const adminUserId = req.user.id;

        // Check if user is admin (you can implement your own admin check)
        // For now, we'll allow any authenticated user to run cleanup

        const cutoffDate = new Date(Date.now() - (parseInt(days) * 24 * 60 * 60 * 1000));

        // Clean up old connection location history (keep only last 100 entries per user)
        const connectionLocations = await ConnectionLocation.find({});

        let updatedConnections = 0;
        for (const connLoc of connectionLocations) {
            let updated = false;

            for (const user of connLoc.users) {
                if (user.locationHistory.length > 5) {
                    user.locationHistory = user.locationHistory.slice(-5);
                    updated = true;
                }
            }

            if (updated) {
                await connLoc.save();
                updatedConnections++;
            }
        }

        res.json({
            success: true,
            message: `Cleanup completed. Updated ${updatedConnections} connections.`,
            cutoffDate: cutoffDate.toISOString()
        });

    } catch (error) {
        console.error('[CLEANUP_OLD_LOCATIONS] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cleanup old locations'
        });
    }
};

// Get a specific user's location
const getUserLocation = async (req, res) => {
    try {
        const { userId: targetUserId } = req.params;
        const currentUserId = req.user.id;
        console.log(targetUserId, " 🚀🚀 faraz are you getting targetuserid")
        console.log(currentUserId, " 🚀🚀🚀 faraz are you getting currentUserId")

        console.log('[USER_LOCATION] Fetching location for user:', targetUserId, 'by user:', currentUserId);

        // Check if current user has access to target user's location
        // This could be enhanced with connection checking if needed
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Use the new intelligent source selection function
        const locationData = await getUserLocationWithFallback(targetUserId);

        if (!locationData || !locationData.location) {
            console.log('[USER_LOCATION] No location data found in memory or database');
            return res.json({
                success: true,
                location: null
            });
        }

        const location = {
            userId: targetUser._id,
            name: targetUser.name,
            avatar: targetUser.image,
            latitude: locationData.location.latitude,
            longitude: locationData.location.longitude,
            online: locationData.location.online || true,
            lastUpdated: locationData.location.lastUpdated,
            source: locationData.source,
            isStale: locationData.isStale
        };

        console.log('[USER_LOCATION] Returning location from', locationData.source, ':', location);

        res.json({
            success: true,
            location
        });

    } catch (error) {
        console.error('[USER_LOCATION] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user location'
        });
    }
};

// NEW: Get memory status for debugging and monitoring 
const getMemoryStatus = () => {
    const now = Date.now();
    const memoryStats = {
        totalUsers: Object.keys(userLocations).length,
        activeUsers: 0,
        staleUsers: 0,
        users: []
    };

    Object.keys(userLocations).forEach(userId => {
        const location = userLocations[userId];
        if (location && location.lastUpdated) {
            const timeSinceUpdate = now - location.lastUpdated;
            const isActive = timeSinceUpdate <= MEMORY_TIMEOUT_MS;

            if (isActive) {
                memoryStats.activeUsers++;
            } else {
                memoryStats.staleUsers++;
            }

            memoryStats.users.push({
                userId,
                lastUpdated: location.lastUpdated,
                timeSinceUpdate: Math.round(timeSinceUpdate / 1000),
                isActive,
                online: location.online || false
            });
        }
    });

    return memoryStats;
};

// NEW: Get memory status for debugging and monitoring
const getMemoryStatusApi = (req, res) => {
    try {
        const memoryStats = locationController.getMemoryStatus();
        res.json({
            success: true,
            message: 'Memory status retrieved successfully',
            memoryStats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[MEMORY_STATUS] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get memory status',
            error: error.message
        });
    }
};

// Enhanced memory cleanup function to remove only stale user data (uses in server.js)
const cleanupStaleMemoryLocations = () => {
    const now = Date.now();
    let cleanedCount = 0;
    let activeUsers = 0;

    Object.keys(userLocations).forEach(userId => {
        const location = userLocations[userId];
        if (location && location.lastUpdated) {
            const timeSinceUpdate = now - location.lastUpdated;

            if (timeSinceUpdate > MEMORY_TIMEOUT_MS) {
                // Only remove users who haven't sent updates in 2+ minutes
                delete userLocations[userId];
                cleanedCount++;
                console.log(`[MEMORY_CLEANUP] Cleaned stale location for user ${userId} (${Math.round(timeSinceUpdate / 1000)}s old)`);
            } else {
                activeUsers++;
                console.log(`[MEMORY_CLEANUP] User ${userId} still active (${Math.round(timeSinceUpdate / 1000)}s since last update)`);
            }
        }
    });

    if (cleanedCount > 0) {
        console.log(`[MEMORY_CLEANUP] Total cleaned: ${cleanedCount} stale entries, ${activeUsers} active users remain`);
    } else {
        console.log(`[MEMORY_CLEANUP] No stale entries found, ${activeUsers} active users in memory`);
    }
};

// Get all user locations from memory (uses in meshController)
const getUserLocations = () => {
    return userLocations;
};



module.exports = {
    markLocation, // use in router  
    getMarkedLocations, // use in router
    handleOwnershipTransfer, // use in router
    syncAllUsersCache, // use in api
    getActiveLocationsForUser, // use in api
    getMarkedLocationEnhanced, // use in router
    updateMarkedLocation, // route
    deleteMarkedLocation, // use in router
    getUserLocations, // mesh
    updateUserLocation, // use in router api
    updateUserLocationForRTT,
    markUserOffline,  // use in router api
    markOfflineUser,
    getGroupLocations,  // route
    getUserLocation, // route
    getConnectionLocationHistory, // route
    cleanupOldLocations, // route
    cleanupStaleMemoryLocations, // use in server.js
    shouldUseMemoryForUser, // use in a api
    getUserLocationWithFallback, // use in a api
    getMemoryStatus, // use in a router api
    getMemoryStatusApi,
    testDB,

};