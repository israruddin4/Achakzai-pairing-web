import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';

const router = express.Router();

// Ensure the session directory exists
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('❌ Error removing file:', e);
    }
}

// Beautiful message formatter
function formatSuccessMessage(code) {
    return {
        success: true,
        code: code,
        message: `✨ *PAIRING CODE GENERATED* ✨\n\n╭─❀─────────❀─╮\n│  🔐 *Your Code:*\n│  ✨ *${code}* ✨\n│\n│  🌸 *How to use:*\n│  1️⃣ Open WhatsApp\n│  2️⃣ Go to Linked Devices\n│  3️⃣ Tap "Link with phone number"\n│  4️⃣ Enter this code\n│\n│  💫 *Quick Tips:*\n│  • Code expires in 5 minutes\n│  • Keep WhatsApp open\n│  • Don't share your code\n╰─❀─────────❀─╯\n\n🌸 *Achakzai 04 MD Bot* 🌸\n💫 _Your WhatsApp Bot is ready to connect!_`,
        timestamp: new Date().toISOString()
    };
}

function formatErrorMessage(errorType, details = '') {
    const errorMessages = {
        invalid: {
            status: 400,
            data: {
                success: false,
                code: 'INVALID_NUMBER',
                message: `🌸 *Invalid Phone Number* 🌸\n\n╭─❀─────────❀─╮\n│  ⚠️ *Error Details:*\n│  ${details || 'Please enter a valid international number'}\n│\n│  📱 *Correct Format:*\n│  • USA: 15551234567\n│  • UK: 447911123456\n│  • Pakistan: 923001234567\n│\n│  ✨ *Tips:*\n│  • Include country code\n│  • Remove + and spaces\n│  • Use digits only\n╰─❀─────────❀─╯\n\n🌸 Try again with correct format 🌸`,
                timestamp: new Date().toISOString()
            }
        },
        failed: {
            status: 503,
            data: {
                success: false,
                code: 'PAIRING_FAILED',
                message: `🌺 *Pairing Failed* 🌺\n\n╭─❀─────────❀─╮\n│  ⚠️ *Unable to generate code*\n│\n│  🔄 *Possible reasons:*\n│  • Network connection issue\n│  • WhatsApp server busy\n│  • Number not registered on WhatsApp\n│\n│  💫 *Solutions:*\n│  • Check your internet\n│  • Verify WhatsApp is installed\n│  • Wait 2 minutes & retry\n│  • Use official WhatsApp app\n╰─❀─────────❀─╯\n\n🌸 Please try again in a moment 🌸`,
                timestamp: new Date().toISOString()
            }
        },
        unavailable: {
            status: 503,
            data: {
                success: false,
                code: 'SERVICE_UNAVAILABLE',
                message: `💫 *Service Temporarily Unavailable* 💫\n\n╭─❀─────────❀─╮\n│  🔄 *Server Status:*\n│  Currently under maintenance\n│\n│  ⏰ *Expected resolution:*\n│  Few minutes\n│\n│  ✨ *What to do:*\n│  • Refresh the page\n│  • Try again shortly\n│  • Check your connection\n│\n│  🌸 Thank you for patience! 🌸\n╰─❀─────────❀─╯\n\n🌸 _Achakzai 04 Bot - Always here for you_ 🌸`,
                timestamp: new Date().toISOString()
            }
        }
    };
    
    return errorMessages[errorType] || errorMessages.failed;
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    let dirs = './' + (num || `session`);

    // Remove existing session if present
    await removeFile(dirs);

    // Clean the phone number - remove any non-digit characters
    num = num.replace(/[^0-9]/g, '');

    // Validate the phone number using awesome-phonenumber
    const phone = pn('+' + num);
    if (!phone.isValid()) {
        if (!res.headersSent) {
            const errorResponse = formatErrorMessage('invalid', 'The phone number you entered is not valid. Please check and try again.');
            return res.status(errorResponse.status).send(errorResponse.data);
        }
        return;
    }
    // Use the international number format (E.164, without '+')
    num = phone.getNumber('e164').replace('+', '');

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            let KnightBot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.windows('Chrome'),
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 250,
                maxRetries: 5,
            });

            KnightBot.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, isNewLogin, isOnline } = update;

                if (connection === 'open') {
                    console.log("✅ Connected successfully!");
                    console.log("📱 Sending session file to user...");
                    
                    try {
                        const sessionKnight = fs.readFileSync(dirs + '/creds.json');

                        // Send session file to user
                        const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                        
                        // Beautiful document message
                        await KnightBot.sendMessage(userJid, {
                            document: sessionKnight,
                            mimetype: 'application/json',
                            fileName: 'creds.json',
                            caption: `🌸 *Achakzai 04 MD Bot - Authentication File* 🌸\n\n╭─❀─────────❀─╮\n│  🔐 *Your Session File*\n│  📁 *File:* creds.json\n│  🤖 *Bot:* Achakzai 04 MD\n│  ✨ *Status:* Ready to use\n│\n│  💫 *Next Steps:*\n│  • Save this file securely\n│  • Place in bot directory\n│  • Restart your bot\n│  • Enjoy all features!\n╰─❀─────────❀─╯\n\n🌸 _Keep this file private!_ 🌸`
                        });
                        console.log("📄 Session file sent successfully");

                        // Send video guide with beautiful formatting
                        await KnightBot.sendMessage(userJid, {
                            image: { url: 'https://img.youtube.com/vi/-oz_u1iMgf8/maxresdefault.jpg' },
                            caption: `🎬 *Complete Setup Guide - Achakzai 04 MD* 🎬\n\n╭─❀─────────❀─╮\n│  📺 *Watch Full Tutorial:*\n│  🔗 Click the link below\n│\n│  🚀 *What's New:*\n│  • Latest Bug Fixes\n│  • 50+ New Commands\n│  • Fast AI Chat System\n│  • Auto Voice Response\n│  • Premium Features\n│\n│  ✨ *Support:*\n│  • Join our community\n│  • Get instant help\n│  • Share feedback\n╰─❀─────────❀─╯\n\n🌸 _Subscribe for updates!_ 🌸`
                        });
                        console.log("🎬 Video guide sent successfully");

                        // Send beautiful warning message with stylish design
                        await KnightBot.sendMessage(userJid, {
                            text: `🌸 *━━━━━━━━━━━━━━━━━━━━* 🌸\n\n*✨ 𝐀𝐂𝐇𝐀𝐊𝐙𝐀𝐈 𝟎𝟒 𝐌𝐃 𝐁𝐎𝐓 ✨*\n\n╭─❀─────────❀─╮\n│  ⚠️ *IMPORTANT SECURITY NOTICE*\n│\n│  🔒 *Do NOT Share This File:*\n│  • Keep creds.json private\n│  • Never forward to anyone\n│  • Store in secure location\n│\n│  💫 *Bot Information:*\n│  • *Bot:* Achakzai 04 MD\n│  • *Version:* Latest Stable\n│  • *Status:* Active ✅\n│  • *Features:* AI Chat, Auto Reply, Games, Music\n│\n│  🌸 *Support Channels:*\n│  • YouTube: @israrumari0312\n│  • GitHub: /Achakzai04\n│  • WhatsApp Channel: Join Now\n│\n│  ✨ *Quick Commands:*\n│  • !menu - Show all commands\n│  • !ping - Check bot status\n│  • !owner - Contact support\n│  • !alive - Bot health check\n╰─❀─────────❀─╯\n\n*📌 Made with ❤️ by 𝐀𝐜𝐡𝐚𝐤𝐳𝐚𝐢 𝟎𝟒*\n*© 2026 All Rights Reserved*\n\n🌸 *━━━━━━━━━━━━━━━━━━━━* 🌸`
                        });
                        console.log("⚠️ Warning message sent successfully");

                        // Clean up session after use
                        console.log("🧹 Cleaning up session...");
                        await delay(1000);
                        removeFile(dirs);
                        console.log("✅ Session cleaned up successfully");
                        console.log("🎉 Process completed successfully!");
                    } catch (error) {
                        console.error("❌ Error sending messages:", error);
                        // Still clean up session even if sending fails
                        removeFile(dirs);
                    }
                }

                if (isNewLogin) {
                    console.log("🔐 New login via pair code");
                }

                if (isOnline) {
                    console.log("📶 Client is online");
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;

                    if (statusCode === 401) {
                        console.log("❌ Logged out from WhatsApp. Need to generate new pair code.");
                    } else {
                        console.log("🔁 Connection closed — restarting...");
                        initiateSession();
                    }
                }
            });

            if (!KnightBot.authState.creds.registered) {
                await delay(3000); // Wait 3 seconds before requesting pairing code
                num = num.replace(/[^\d+]/g, '');
                if (num.startsWith('+')) num = num.substring(1);

                try {
                    let code = await KnightBot.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    if (!res.headersSent) {
                        console.log({ num, code });
                        const successResponse = formatSuccessMessage(code);
                        await res.status(200).send(successResponse);
                    }
                } catch (error) {
                    console.error('Error requesting pairing code:', error);
                    if (!res.headersSent) {
                        const errorResponse = formatErrorMessage('failed');
                        res.status(errorResponse.status).send(errorResponse.data);
                    }
                }
            }

            KnightBot.ev.on('creds.update', saveCreds);
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                const errorResponse = formatErrorMessage('unavailable');
                res.status(errorResponse.status).send(errorResponse.data);
            }
        }
    }

    await initiateSession();
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    let e = String(err);
    if (e.includes("conflict")) return;
    if (e.includes("not-authorized")) return;
    if (e.includes("Socket connection timeout")) return;
    if (e.includes("rate-overlimit")) return;
    if (e.includes("Connection Closed")) return;
    if (e.includes("Timed Out")) return;
    if (e.includes("Value not found")) return;
    if (e.includes("Stream Errored")) return;
    if (e.includes("Stream Errored (restart required)")) return;
    if (e.includes("statusCode: 515")) return;
    if (e.includes("statusCode: 503")) return;
    console.log('Caught exception: ', err);
});

export default router;