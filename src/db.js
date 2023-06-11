const mongoose = require('mongoose');

mongoose.connect(process.env.mongoUrl);
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    hwid: {
        type: String,
    },
    createdOn: {
        type: Date,
        default: new Date(),
    },
    admin: {
        type: Boolean,
        default: false
    },
    subscribed: {
        type: Boolean,
        default: false
    },
    subscriptionTimeLeft: {
        type: String,
    },
    lastConnection: {
        type: String
    }
});

const postSchema = new mongoose.Schema({
    title: {
        type: String,
    },
    body: {
        type: String,
    }
});

const Post = mongoose.model("Post", postSchema);
const User = mongoose.model("User", userSchema);

module.exports = {Post, User};