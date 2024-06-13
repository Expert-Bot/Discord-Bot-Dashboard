require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { Sequelize, DataTypes } = require('sequelize');
const { spawn } = require('child_process');
const canvafy = require('canvafy'); // Assuming canvafy is a hypothetical module to handle images

// Start server.js
const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    shell: true
});

const sequelize = new Sequelize('sqlite:./database.sqlite', {
    logging: console.log,
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
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

// Use `sync` with `{ alter: true }` to update the table schema
sequelize.sync({ force: true }).then(() => {
    console.log('Database synchronized');
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', async member => {
    const config = await ServerConfig.findOne({ where: { guildId: member.guild.id } });
    if (config && (config.welcomeMessage || config.welcomeImageUrl) && config.welcomeChannelId) {
        const welcomeChannel = member.guild.channels.cache.find(channel => channel.type === 'text' && channel.id === config.welcomeChannelId);
        if (welcomeChannel) {
            const welcomeEmbed = new EmbedBuilder()
                .setDescription(config.welcomeMessage ? config.welcomeMessage.replace('{user}', `<@${member.user.id}>`) : '')
                .setImage(config.welcomeImageUrl ? config.welcomeImageUrl : '')
                .setColor(config.embedColor ? config.embedColor : '#000000'); // Set embed color

            welcomeChannel.send({ embeds: [welcomeEmbed] });
        }
    }
});


// Listen for invite events (this part may need a third-party library or custom implementation as Discord.js doesn't support invite tracking directly)
client.on('inviteCreate', async invite => {
    const config = await ServerConfig.findOne({ where: { guildId: invite.guild.id } });
    if (config && config.inviteLogsChannelId) {
        const logsChannel = invite.guild.channels.cache.get(config.inviteLogsChannelId);
        if (logsChannel) {
            const inviteEmbed = new EmbedBuilder()
                .setTitle('New Invite Created')
                .addFields(
                    { name: 'Inviter', value: invite.inviter.tag },
                    { name: 'Code', value: invite.code },
                    { name: 'Channel', value: invite.channel.name },
                    { name: 'Expires At', value: invite.expiresAt ? invite.expiresAt.toISOString() : 'Never' },
                )
                .setTimestamp();

            logsChannel.send({ embeds: [inviteEmbed] });
        }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
