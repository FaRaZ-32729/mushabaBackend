const mongoose = require('mongoose');

const personalPinLocationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // NO connectionId - completely isolated
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['taxi', 'bus', 'restaurant', 'hotel', 'cafe', 'coffee', 'shopping', 'park', 'hospital', 'school', 'office', 'gas', 'location', 'other'],
    index: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  latitude: {
    type: Number,
    required: true,
    min: -90,
    max: 90
  },
  longitude: {
    type: Number,
    required: true,
    min: -180,
    max: 180
  },
  comment: {
    type: String,
    required: false,
    maxlength: 500,
    default: ''
  },
  images: [{
    type: String,
    required: false
  }],
  icon: {
    type: String,
    required: true
  },
  markedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // NO expiresAt - personal pins don't expire
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
personalPinLocationSchema.index({ userId: 1, isActive: 1 });
personalPinLocationSchema.index({ chatId: 1, isActive: 1 });
personalPinLocationSchema.index({ type: 1, isActive: 1 });

// Pre-save middleware to update timestamp
personalPinLocationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get user's personal pins
personalPinLocationSchema.statics.getUserPersonalPins = function(userId) {
  return this.find({
    userId,
    isActive: true
  });
};

// Static method to get user's personal pins for specific chat
personalPinLocationSchema.statics.getUserPersonalPinsForChat = function(userId, chatId) {
  return this.find({
    userId,
    chatId,
    isActive: true
  });
};

const PersonalPinLocation = mongoose.model('PersonalPinLocation', personalPinLocationSchema);

module.exports = PersonalPinLocation;