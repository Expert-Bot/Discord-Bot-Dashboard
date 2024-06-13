require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { Strategy } = require('passport-discord');
const { Sequelize, DataTypes } = require('sequelize');
const { Client } = require('discord.js');
const path = require('path');
const sequelize = new Sequelize('sqlite:./database.sqlite');

const client = new Client({
    intents: ['Guilds']
});

const ServerConfig = sequelize.define('ServerConfig', {
    guildId: {
        type: DataTypes.STRING,
        unique: true,
    },
    welcomeMessage: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    welcomeChannelId: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    welcomeImageUrl: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    inviteLogsChannelId: {
        type: DataTypes.STRING,
        allowNull: true,
    },
});
sequelize.sync({ force: true }).then(() => {
    console.log('Database synchronized');
});

const app = express();

passport.use(new Strategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/callback',
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.use(session({ secret: 'secret', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.render('index', { user: req.user }));
app.get('/login', passport.authenticate('discord'));
app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => res.redirect('/dashboard'));
app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

app.post('/dashboard', async (req, res) => {
    const guildId = req.body.guildId;
    res.redirect(`/dashboard?guildId=${guildId}`);
});

app.get('/dashboard', async (req, res) => {
    const user = req.user;
    const guildId = req.query.guildId;
    let selectedGuild = null;

    if (guildId) {
        client.guilds.fetch(guildId).then(guild => {
            selectedGuild = guild;
            client.guilds.fetch().then(guilds => {
                res.render('dashboard', { user, guilds: Array.from(guilds.values()), selectedGuild });
            });
        });
    } else {
        client.guilds.fetch().then(guilds => {
            res.render('dashboard', { user, guilds: Array.from(guilds.values()), selectedGuild });
        });
    }
});
app.get('/dashboard/:guildId/welcome', checkAuth, async (req, res) => {
    const guild = req.user.guilds.find(g => g.id === req.params.guildId);
    if (!guild) return res.redirect('/dashboard');

    const discordGuild = await client.guilds.fetch(guild.id);
    const channels = await discordGuild.channels.fetch();

    const config = await ServerConfig.findOne({ where: { guildId: guild.id } });
    res.render('welcome-settings', { user: req.user, guild, config, channels: channels.map(channel => ({ id: channel.id, name: channel.name })) });
});

app.post('/dashboard/:guildId/welcome', checkAuth, async (req, res) => {
    const guild = req.user.guilds.find(g => g.id === req.params.guildId);
    if (!guild) return res.redirect('/dashboard');
    let config = await ServerConfig.findOne({ where: { guildId: guild.id } });
    if (!config) {
        config = await ServerConfig.create({ guildId: guild.id });
    }
    config.welcomeMessage = req.body.welcomeMessage;
    config.welcomeChannelId = req.body.welcomeChannelId;
    config.welcomeImageUrl = req.body.welcomeImageUrl;
    await config.save();
    res.redirect(`/dashboard/${guild.id}/welcome`);
});

app.get('/dashboard/:guildId/invite-logs', checkAuth, async (req, res) => {
    const guild = req.user.guilds.find(g => g.id === req.params.guildId);
    if (!guild) return res.redirect('/dashboard');

    const discordGuild = await client.guilds.fetch(guild.id);
    const channels = await discordGuild.channels.fetch();

    const config = await ServerConfig.findOne({ where: { guildId: guild.id } });
    res.render('invite-logs-settings', { user: req.user, guild, config, channels: channels.map(channel => ({ id: channel.id, name: channel.name })) });
});

app.post('/dashboard/:guildId/invite-logs', checkAuth, async (req, res) => {
    const guild = req.user.guilds.find(g => g.id === req.params.guildId);
    if (!guild) return res.redirect('/dashboard');
    let config = await ServerConfig.findOne({ where: { guildId: guild.id } });
    if (!config) {
        config = await ServerConfig.create({ guildId: guild.id });
    }
    config.inviteLogsChannelId = req.body.inviteLogsChannelId;
    await config.save();
    res.redirect(`/dashboard/${guild.id}/invite-logs`);
});

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/');
}

client.once('ready', () => {
    app.listen(3000, () => console.log('Server running on http://localhost:3000'));
});

client.login(process.env.DISCORD_BOT_TOKEN);
