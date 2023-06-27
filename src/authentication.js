/* eslint-disable no-undef */
const express = require('express');
require('dotenv').config();
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const app = express();
app.use(cookieParser());
const { User } = require('./db');

const createToken = (id) => {
    return jwt.sign({ id }, process.env.jwtsecret, {
        expiresIn: 60 * 20
    });
};

const checkUser = (req, res, next) => {
    const token = req.cookies.jwt;
    if (token) {
        jwt.verify(token, process.env.jwtsecret, async (err, decodedToken) => {
            if (err) {
                console.log(err.message);
                res.locals.user = null;
                next();
            } else {
                console.log(decodedToken);
                let user = await User.findById(decodedToken.id);
                res.locals.user = user;
                next();
            }
        });
    } else { res.locals.user = ''; next(); }
};


module.exports = { checkUser, createToken };