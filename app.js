const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const passport = require('passport');
const net = require('net');
const axios = require('axios');
require('dotenv').config();



const { Post, User } = require('./src/db.js');


const { Strategy } = require('passport-local');
const { memoryUsage } = require('process');

let noCredsReg = false;
let existsReg = false;
let noCaptchaReg = false;

let port = process.env.PORT;
if (port == null || port == "") {
    port = 3000;
}
const app = express();

app.set('json spaces', 40);
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: process.env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.mongoUrl,
    }),
    cookie: { maxAge: 1000000 }
}));

passport.serializeUser((user, done) => {
    console.log('Serializing user..');
    done(null, user.id)
});
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        if (!user) throw new Error('User not found');
        console.log("Deserializing User");
        done(null, user);
    } catch (err) {
        console.log(err);
        done(err, null);
    }
});
passport.use(
    new Strategy({
        usernameField: 'username',
    }, async (username, password, done) => {
        try {
            if (!username || !password) {
                console.log("please enter a user or pw");
                throw new Error('Missing Credentials');
            }
            const dbUser = await User.findOne({ username });
            if (!dbUser) {
                noCredsLog = true;
                throw new Error('user not found');
            }
            const isValid = await bcrypt.compare(password, dbUser.password);
            if (isValid) {

                console.log('Authenticated Successfully!');
                done(null, dbUser);
            } else {
                console.log('Invalid Authentication');
                done(null, null);
            }
        } catch (err) {
            console.log('err');
            done(err, null);
        }
    })
);

app.use(passport.initialize());
app.use(passport.session());

// GET requests //
app.get("/", async (req, res, next) => {
    const changelogPosts = await Post.find({});
    res.render('home', { user: (req.user ? req.user : ''), postArray: changelogPosts });
});
app.get("/features", async (req, res) => {
    res.render('features', { user: (req.user ? req.user : '') });
});
app.get("/subscribe", async (req, res) => {
    res.render('subscribe', { user: (req.user ? req.user : '') });
});

app.get("/changelog", async (req, res) => {
    const changelogPosts = await Post.find({});
    res.render('changelog', { user: (req.user ? req.user : ''), postArray: changelogPosts });
});
app.get("/login", async (req, res) => {
    res.render('login', { user: (req.user ? req.user : ''), found: true });
});
app.get("/register", async (req, res) => {
    res.render('register', { user: (req.user ? req.user : ''), noCreds: noCredsReg, exists: existsReg, noCaptcha: noCaptchaReg });
    noCredsReg = false;
    existsReg = false;
    noCaptchaReg = false;
});

app.get("/profile", async (req, res) => {
    if (req.user) {
        const client = new net.Socket();
        client.connect(9999, process.env.profileIP, () => {
            client.write(`HWID: ${req.user.hwid || "None"}`);
            client.on('data', (data) => {
                if (data.toString() === "Invalid HWID") {
                    res.render('profile', { user: (req.user ? req.user : ''), response: "Invalid HWID" });
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
                    res.render('profile', { user: (req.user ? req.user : ''), timeLeft: finalTime, response: response });
                }
                client.destroy();
            });
            client.on('close', () => {
                console.log('Connection closed');
            });
        });
        client.on('error', (err) => {
            console.log(err);
            res.render('profile', { user: (req.user ? req.user : '') });
        })
    } else res.redirect('/login');

});
app.get('/logout', async (req, res) => {
    req.logOut((err) => {
        if (err) console.log(err);
        res.redirect('/');
    });
});

// POST requests //
app.post("/register", async (req, res) => {
    const response_key = req.body['g-recaptcha-response'];
    const secret_key = process.env.secret_key;
    const url = `https://www.google.com/recaptcha/api/siteverify?secret=${secret_key}&response=${response_key}`;

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
                res.send(response.data.success);
                // noCaptchaReg = true;
                // res.redirect('/register');
            }
        })
});

app.post('/login', passport.authenticate('local'), (req, res) => {
    console.log('logged in');
    res.redirect('/');
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
    await User.findOneAndUpdate({ username: req.user.username }, { hwid: hwid || "None" }, { new: true });
    res.redirect('/profile');
});
app.post('/editHwid', async (req, res) => {
    const hwid = req.body.hwid;
    await User.findOneAndUpdate({ username: req.user.username }, { hwid: hwid || "None" }, { new: true });
    res.redirect('/profile');
});

app.listen(port, () => { console.log(`listening on port ${port}`) });