/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const net = require('net');
const axios = require('axios');
require('dotenv').config();
const favicon = require('serve-favicon');
const path = require('path');
const limiter = require('express-rate-limit');
const { checkUser, createToken } = require('./src/authentication.js');
const cookieParser = require('cookie-parser');

const { Post, User } = require('./src/db.js');

let noCredsReg = false;
let existsReg = false;
let noCaptchaReg = false;
let noCredsLog = false;
let invalidCreds = false;

let port = process.env.PORT;
if (port == null || port == '') {
    port = 3000;
}
const app = express();


app.use(favicon(path.join(__dirname, 'public', 'images', 'favicon.ico')));
app.set('json spaces', 40);
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('trust proxy', 1);
app.use(limiter({
    windowMs: 5000,
    max: 5,
}));
app.use(cookieParser());
app.get('*', checkUser);
app.post('*', checkUser);


// GET requests //
app.get('/', async (req, res, next) => {
    const changelogPosts = await Post.find({});
    res.render('home', { postArray: changelogPosts });
});
app.get('/features', async (req, res) => {
    res.render('features');
});
app.get('/how-to', async (req, res) => {
    res.render('how-to');
});

app.get('/changelog', async (req, res) => {
    const changelogPosts = await Post.find({});
    res.render('changelog', { postArray: changelogPosts });
});
app.get('/login', async (req, res) => {
    res.render('login', { noCreds: noCredsLog, invalidCreds: invalidCreds, });
    noCredsLog = false;
    existsLog = false;
    invalidCreds = false;
});
app.get('/register', async (req, res) => {
    res.render('register', { noCreds: noCredsReg, exists: existsReg, noCaptcha: noCaptchaReg });
    noCredsReg = false;
    existsReg = false;
    noCaptchaReg = false;
});

app.get('/profile', async (req, res) => {
    if (res.locals.user) {
        const client = new net.Socket();
        client.connect(9999, process.env.profileIP, () => {
            client.write(`HWID: ${res.locals.user.hwid || 'None'}`);
            client.on('data', (data) => {
                if (data.toString() === 'Invalid HWID') {
                    res.render('profile', { response: 'Invalid HWID' });
                } else {
                    const response = JSON.parse(data);
                    const time = Date.now();
                    let timeLeft = (Math.floor(time / (1000 * 60 * 60))) - (response.clientExpiretime);
                    if (timeLeft < 0) {
                        timeLeft = Math.abs(timeLeft);
                    } else if (timeLeft > 0) {
                        timeLeft = 0;
                    }
                    const timeLeftMinutes = timeLeft * 60;
                    const timeDays = Math.trunc((timeLeftMinutes / (60 * 24)));
                    const timeHours = Number((timeLeftMinutes / (60 * 24)) - timeDays) * 24;
                    const finalTime = { days: timeDays, hours: timeHours.toFixed(0) };
                    // console.log(timeLeft, time, response.clientExpiretime);
                    console.log(`Response from socket server: ${data}`);
                    res.render('profile', { timeLeft: finalTime, response: response });
                }
                client.destroy();
            });
            client.on('close', () => {
                console.log('Connection closed');
            });
        });
        client.on('error', (err) => {
            console.log(err);
            res.render('profile');
        });
    } else res.redirect('/login');

});
app.get('/logout', async (req, res) => {
    res.cookie('jwt', '', { expiresIn: 1 });
    res.redirect('/');
});
app.get('/usersAdmin', async (req, res) => {
    // Check if logged in user is an admin
    if (res.locals.user.admin) {
        const users = await User.find({});
        res.render('users', { dbUsers: users });
    } else {
        res.redirect('/');
    }
});

// POST requests //
app.post('/register', async (req, res) => {
    const response_key = req.body['g-recaptcha-response'];
    const secret_key = process.env.secret_key;
    const url = `https://www.google.com/recaptcha/api/siteverify?secret=${secret_key}&response=${response_key}`;
    // axios post request to google's api for recaptcha v2
    axios.post(url, {})
        .then(async (response) => {
            if (response.data.success === true) {
                const { username, password, hwid } = req.body;
                const foundUser = await User.findOne({ username: username });
                if (!username || !password) {
                    // No email or password entered
                    noCredsReg = true;
                    res.redirect('/register');
                } else {
                    if (foundUser) {
                        // Username already exists!
                        existsReg = true;
                        res.redirect('/register');
                    } else {
                        const hashedpw = await bcrypt.hash(password, 10);
                        await User.create({
                            username: username,
                            password: hashedpw,
                            hwid: hwid
                        });
                        noCaptchaReg = false;
                        res.redirect('/login');
                    }
                }
            } else {
                noCaptchaReg = true;
                res.redirect('/register');
            }
        });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        // no username or password input
        noCredsLog = true;
        res.redirect('/login');
    } else {
        const user = await User.findOne({ username });
        if (user) {
            const matched = await bcrypt.compare(password, user.password);
            console.log(matched);
            if (matched) {
                const token = createToken(user._id);
                res.cookie('jwt', token, { httpOnly: true, maxAge: 15 * 60 * 1000 });
                res.redirect('/');
            } else {
                // Wrong username or password
                invalidCreds = true;
                res.redirect('/login');
            }
        } else {
            // Username not found
            invalidCreds = true;
            res.redirect('/login');
        }
    }
});

app.post('/addpost', async (req, res) => {
    const { body, title } = req.body;
    await Post.create({ body: body, title: title });
    res.redirect('/changelog');
});
app.post('/deletepost', async (req, res) => {
    console.log(req.body.postId);
    await Post.findByIdAndDelete(req.body.postId);
    res.redirect('/changelog');
});
app.post('/addHwid', async (req, res) => {
    const hwid = req.body.hwid;
    await User.findOneAndUpdate({ username: res.locals.user.username }, { hwid: hwid || 'None' }, { new: true });
    res.redirect('/profile');
});
app.post('/editHwid', async (req, res) => {
    const hwid = req.body.hwid;
    await User.findOneAndUpdate({ username: res.locals.user.username }, { hwid: hwid || 'None' }, { new: true });
    res.redirect('/profile');
});

app.listen(port, () => { console.log(`listening on port ${port}`); });