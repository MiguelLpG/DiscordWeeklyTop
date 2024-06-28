import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { MessageCount } from './models/messageCount';
import { scheduleJob } from 'node-schedule';
import { getISOWeek, getYear } from 'date-fns';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Mapa para rastrear el tiempo de unión de los usuarios a los canales de voz
const voiceJoinTimestamps = new Map<string, Date>();

client.once('ready', async () => {
    console.log('[DEBUG] El bot se ha encendido con éxito.');

    // Conectar a MongoDB
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('[DB] El bot se ha conectado a MongoDB.');
    } catch (error) {
        console.error('[BD ERR] Ha ocurrido un error al conectarse a la base de datos:', error);
    }

    // Programar el top semanal
    scheduleJob('0 0 * * 1', postWeeklyTop);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const week = getISOWeek(new Date());
    const year = getYear(new Date());

    await MessageCount.findOneAndUpdate(
        { userId: message.author.id, week, year },
        { $inc: { count: 1 } },
        { new: true, upsert: true }
    );

    // COmandos del LB \\
    if (message.content === '!lb mensajes') {
        await sendLeaderboard(message.channel as TextChannel, 'count', 'mensajes enviados');
    } else if (message.content === '!lb voz') {
        await sendLeaderboard(message.channel as TextChannel, 'voiceTime', 'minutos en canales de voz');
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    if (newState.member?.user.bot) return;

    const userId = newState.member!.user.id;
    const week = getISOWeek(new Date());
    const year = getYear(new Date());

    if (!oldState.channelId && newState.channelId) {
        voiceJoinTimestamps.set(userId, new Date());
    } else if (oldState.channelId && !newState.channelId) {
        const joinedAt = voiceJoinTimestamps.get(userId);
        if (joinedAt) {
            const timeSpent = (new Date().getTime() - joinedAt.getTime()) / 1000; // en segundos
            await MessageCount.findOneAndUpdate(
                { userId, week, year },
                { $inc: { voiceTime: timeSpent } },
                { new: true, upsert: true }
            );
            voiceJoinTimestamps.delete(userId); // Eliminar el timestamp cuando se salga
        }
    }
});

async function postWeeklyTop() {
    const week = getISOWeek(new Date());
    const year = getYear(new Date());

    const topMessages = await MessageCount.find({ week, year })
        .sort({ count: -1 })
        .limit(5)
        .exec();

    const topVoice = await MessageCount.find({ week, year })
        .sort({ voiceTime: -1 })
        .limit(5)
        .exec();

    let topMessage = `**Usuarios con más mensajes en la semana nº ${week} del año ${year}**\n`;
    topMessages.forEach((user, index) => {
        topMessage += `${index + 1}. <@${user.userId}>: ${user.count} mensajes.\n`;
    });

    let topVoiceMessage = `**Usuarios con más tiempo en un canal de voz en la semana nº ${week} del año ${year}**\n`;
    topVoice.forEach((user, index) => {
        topVoiceMessage += `${index + 1}. <@${user.userId}>: ${Math.floor(user.voiceTime / 60)} minutos.\n`;
    });

    const channel = client.channels.cache.get('1256229703648542891') as TextChannel;
    if (channel) {
        channel.send(topMessage);
        channel.send(topVoiceMessage);
    }
}

async function sendLeaderboard(channel: TextChannel, field: 'count' | 'voiceTime', label: 'mensajes enviados' | 'minutos en canales de voz') {
    const week = getISOWeek(new Date());
    const year = getYear(new Date());

    const topUsers = await MessageCount.find({ week, year })
        .sort({ [field]: -1 })
        .limit(5)
        .exec();

    let leaderboardMessage = `**Top 5 usuarios de __${label}__ en la semana nº ${week} del año ${year}**\n`;
    topUsers.forEach((user, index) => {
        if (field === 'count') {
            leaderboardMessage += `${index + 1}. <@${user.userId}>: ${user.count} ${label}\n`;
        } else {
            leaderboardMessage += `${index + 1}. <@${user.userId}>: ${Math.floor(user.voiceTime / 60)} ${label}\n`;
        }
    });

    channel.send(leaderboardMessage);
}

client.login(process.env.DISCORD_TOKEN);
