import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { delay } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';

const router = express.Router();

// Function to remove files or directories
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
        return true;
    } catch (e) {
        console.error('❌ Error removing file:', e);
        return false;
    }
}

// Beautiful message formatter for QR responses
function formatQRSuccessMessage(qrDataURL) {
    return {
        success: true,
        qr: qrDataURL,
        message: `🌸 *QR CODE GENERATED* 🌸\n\n╭─❀─────────❀─╮\n│  📱 *Scan to Connect*\n│\n│  🔐 *Your QR Code is Ready*\n│  🤖 *Bot:* Achakzai 04 MD\n│  ✨ *Status:* Waiting for scan\n│\n│  💫 *How to Connect:*\n│  1️⃣ Open WhatsApp on phone\n│  2️⃣ Tap ⋮ (3 dots) or Settings\n│  3️⃣ Select "Linked Devices"\n│  4️⃣ Tap "Link a Device"\n│  5️⃣ Scan QR Code above\n│\n│  🌸 *Quick Tips:*\n│  • QR expires in 2 minutes\n│  • Keep WhatsApp active\n│  • Scan within time limit\n│  • Don't share QR publicly\n╰─❀─────────❀─╯\n\n🌸 *Achakzai 04 MD Bot* 🌸\n💫 _Waiting for your scan..._`,
        instructions: [
            '🌸 Open WhatsApp on your phone',
            '📱 Go to Settings / Linked Devices',
            '🔗 Tap "Link a Device"',
            '✨ Scan the QR code above',
            '💫 Wait for connection confirmation'
        ],
        timestamp: new Date().toISOString()
    };
}

function formatQRErrorMessage(errorType, details = '') {
    const errorMessages = {
        timeout: {
            status: 408,
            data: {
                success: false,
                code: 'QR_TIMEOUT',
                message: `🌸 *QR Code Timeout* 🌸\n\n╭─❀─────────❀─╮\n│  ⏰ *No Scan Detected*\n│\n│  ⚠️ *The QR code expired*\n│\n│  🔄 *What to do:*\n│  • Refresh the page\n│  • Generate new QR code\n│  • Check your internet\n│  • Make sure WhatsApp is updated\n│\n│  💫 *Tips for success:*\n│  • Scan within 30 seconds\n│  • Keep phone close to screen\n│  • Use WhatsApp app, not web\n╰─❀─────────❀─╯\n\n🌸 _Generate a new QR code to connect_ 🌸`,
                timestamp: new Date().toISOString()
            }
        },
        failed: {
            status: 500,
            data: {
                success: false,
                code: 'QR_GENERATION_FAILED',
                message: `🌺 *QR Generation Failed* 🌺\n\n╭─❀─────────❀─╮\n│  ⚠️ *Unable to generate QR*\n│\n│  🔄 *Possible reasons:*\n│  • Network connection issue\n│  • Server temporary error\n│  • QR service unavailable\n│\n│  ✨ *Solutions:*\n│  • Check your internet\n│  • Refresh the page\n│  • Wait 30 seconds & retry\n│  • Clear browser cache\n╰─❀─────────❀─╯\n\n🌸 _Please try again in a moment_ 🌸`,
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
        },
        connection_failed: {
            status: 503,
            data: {
                success: false,
                code: 'CONNECTION_FAILED',
                message: `🌼 *Connection Failed* 🌼\n\n╭─❀─────────❀─╮\n│  🔌 *Could not connect to WhatsApp*\n│\n│  ⚠️ *Error Details:*\n│  ${details || 'Connection attempt failed'}\n│\n│  🔄 *Troubleshooting:*\n│  • Check your internet\n│  • Verify WhatsApp is working\n│  • Try again in a few minutes\n│  • Restart your device if needed\n│\n│  💫 *Need help?*\n│  • Join our support channel\n│  • Check latest updates\n╰─❀─────────❀─╯\n\n🌸 _Keep trying - we're here to help!_ 🌸`,
                timestamp: new Date().toISOString()
            }
        }
    };
    
    return errorMessages[errorType] || errorMessages.failed;
}

router.get('/', async (req, res) => {
    // Generate unique session for each request to avoid conflicts
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const dirs = `./qr_sessions/session_${sessionId}`;

    // Ensure qr_sessions directory exists
    if (!fs.existsSync('./qr_sessions')) {
        fs.mkdirSync('./qr_sessions', { recursive: true });
    }

    async function initiateSession() {
        // ✅ PERMANENT FIX: Create the session folder before anything
        if (!fs.existsSync(dirs)) fs.mkdirSync(dirs, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            
            let qrGenerated = false;
            let responseSent = false;

            // QR Code handling logic with beautiful formatting
            const handleQRCode = async (qr) => {
                if (qrGenerated || responseSent) return;
                
                qrGenerated = true;
                console.log('🌸 QR Code Generated! Scan it with your WhatsApp app.');
                console.log('📋 Beautiful Instructions:');
                console.log('1️⃣ Open WhatsApp on your phone');
                console.log('2️⃣ Go to Settings > Linked Devices');
                console.log('3️⃣ Tap "Link a Device"');
                console.log('4️⃣ Scan the QR code below');
                
                try {
                    // Generate QR code as data URL with beautiful colors
                    const qrDataURL = await QRCode.toDataURL(qr, {
                        errorCorrectionLevel: 'H',
                        type: 'image/png',
                        quality: 0.95,
                        margin: 2,
                        color: {
                            dark: '#c45c2c',
                            light: '#fff5ed'
                        }
                    });

                    if (!responseSent) {
                        responseSent = true;
                        console.log('✅ QR Code generated successfully');
                        const successResponse = formatQRSuccessMessage(qrDataURL);
                        await res.status(200).send(successResponse);
                    }
                } catch (qrError) {
                    console.error('❌ Error generating QR code:', qrError);
                    if (!responseSent) {
                        responseSent = true;
                        const errorResponse = formatQRErrorMessage('failed');
                        res.status(errorResponse.status).send(errorResponse.data);
                    }
                }
            };

            // Improved Baileys socket configuration
            const socketConfig = {
                version,
                logger: pino({ level: 'silent' }),
                browser: Browsers.windows('Chrome'),
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 250,
                maxRetries: 5,
            };

            // Create socket and bind events
            let sock = makeWASocket(socketConfig);
            let reconnectAttempts = 0;
            const maxReconnectAttempts = 3;

            // Connection event handler function
            const handleConnectionUpdate = async (update) => {
                const { connection, lastDisconnect, qr } = update;
                console.log(`🔄 Connection update: ${connection || 'undefined'}`);

                if (qr && !qrGenerated) {
                    await handleQRCode(qr);
                }

                if (connection === 'open') {
                    console.log('✅ Connected successfully!');
                    console.log('💾 Session saved to:', dirs);
                    reconnectAttempts = 0;
                    
                    try {
                        // Read the session file
                        const sessionKnight = fs.readFileSync(dirs + '/creds.json');
                        
                        // Get the user's JID from the session
                        const userJid = Object.keys(sock.authState.creds.me || {}).length > 0 
                            ? jidNormalizedUser(sock.authState.creds.me.id) 
                            : null;
                            
                        if (userJid) {
                            // Send beautiful session file message
                            await sock.sendMessage(userJid, {
                                document: sessionKnight,
                                mimetype: 'application/json',
                                fileName: 'creds.json',
                                caption: `🌸 *Achakzai 04 MD Bot - Authentication File* 🌸\n\n╭─❀─────────❀─╮\n│  🔐 *Your Session File*\n│  📁 *File:* creds.json\n│  🤖 *Bot:* Achakzai 04 MD\n│  ✨ *Status:* Ready to use\n│\n│  💫 *Next Steps:*\n│  • Save this file securely\n│  • Place in bot directory\n│  • Restart your bot\n│  • Enjoy all features!\n╰─❀─────────❀─╯\n\n🌸 _Keep this file private!_ 🌸`
                            });
                            console.log("📄 Session file sent successfully to", userJid);
                            
                            // Send beautiful video guide message
                            await sock.sendMessage(userJid, {
                                image: { url: 'https://img.youtube.com/vi/-oz_u1iMgf8/maxresdefault.jpg' },
                                caption: `🎬 *Complete Setup Guide - Achakzai 04 MD* 🎬\n\n╭─❀─────────❀─╮\n│  📺 *Watch Full Tutorial:*\n│  🔗 https://youtu.be/NjOipI2AoMk\n│\n│  🚀 *What's New:*\n│  • Latest Bug Fixes\n│  • 50+ New Commands\n│  • Fast AI Chat System\n│  • Auto Voice Response\n│  • Premium Features\n│\n│  ✨ *Support:*\n│  • Join our community\n│  • Get instant help\n│  • Share feedback\n╰─❀─────────❀─╯\n\n🌸 _Subscribe for updates!_ 🌸`
                            });
                            console.log("🎬 Video guide sent successfully");
                            
                            // Send beautiful warning message
                            await sock.sendMessage(userJid, {
                                text: `🌸 *━━━━━━━━━━━━━━━━━━━━* 🌸\n\n*✨ 𝐀𝐂𝐇𝐀𝐊𝐙𝐀𝐈 𝟎𝟒 𝐌𝐃 𝐁𝐎𝐓 ✨*\n\n╭─❀─────────❀─╮\n│  ⚠️ *IMPORTANT SECURITY NOTICE*\n│\n│  🔒 *Do NOT Share This File:*\n│  • Keep creds.json private\n│  • Never forward to anyone\n│  • Store in secure location\n│\n│  💫 *Bot Information:*\n│  • *Bot:* Achakzai 04 MD\n│  • *Version:* Latest Stable\n│  • *Status:* Active ✅\n│  • *Features:* AI Chat, Auto Reply, Games, Music\n│\n│  🌸 *Support Channels:*\n│  • YouTube: @israrumari0312\n│  • GitHub: /Achakzai04\n│  • WhatsApp Channel: Join Now\n│\n│  ✨ *Quick Commands:*\n│  • !menu - Show all commands\n│  • !ping - Check bot status\n│  • !owner - Contact support\n│  • !alive - Bot health check\n╰─❀─────────❀─╯\n\n*📌 Made with ❤️ by 𝐀𝐜𝐡𝐚𝐤𝐳𝐚𝐢 𝟎𝟒*\n*© 2026 All Rights Reserved*\n\n🌸 *━━━━━━━━━━━━━━━━━━━━* 🌸`
                            });
                            console.log("⚠️ Warning message sent successfully");
                        } else {
                            console.log("❌ Could not determine user JID to send session file");
                        }
                    } catch (error) {
                        console.error("❌ Error sending session file:", error);
                    }
                    
                    // Clean up session after successful connection and sending files
                    setTimeout(() => {
                        console.log('🧹 Cleaning up session...');
                        const deleted = removeFile(dirs);
                        if (deleted) {
                            console.log('✅ Session cleaned up successfully');
                        } else {
                            console.log('❌ Failed to clean up session folder');
                        }
                    }, 15000);
                }

                if (connection === 'close') {
                    console.log('❌ Connection closed');
                    if (lastDisconnect?.error) {
                        console.log('❗ Last Disconnect Error:', lastDisconnect.error);
                    }
                    
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    
                    if (statusCode === 401) {
                        console.log('🔐 Logged out - need new QR code');
                        removeFile(dirs);
                        if (!responseSent) {
                            responseSent = true;
                            const errorResponse = formatQRErrorMessage('connection_failed', 'Logged out from WhatsApp');
                            res.status(errorResponse.status).send(errorResponse.data);
                        }
                    } else if (statusCode === 515 || statusCode === 503) {
                        console.log(`🔄 Stream error (${statusCode}) - attempting to reconnect...`);
                        reconnectAttempts++;
                        
                        if (reconnectAttempts <= maxReconnectAttempts) {
                            console.log(`🔄 Reconnect attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
                            setTimeout(() => {
                                try {
                                    sock = makeWASocket(socketConfig);
                                    sock.ev.on('connection.update', handleConnectionUpdate);
                                    sock.ev.on('creds.update', saveCreds);
                                } catch (err) {
                                    console.error('Failed to reconnect:', err);
                                }
                            }, 2000);
                        } else {
                            console.log('❌ Max reconnect attempts reached');
                            if (!responseSent) {
                                responseSent = true;
                                const errorResponse = formatQRErrorMessage('connection_failed', 'Multiple connection attempts failed');
                                res.status(errorResponse.status).send(errorResponse.data);
                            }
                        }
                    }
                }
            };

            // Bind the event handler
            sock.ev.on('connection.update', handleConnectionUpdate);
            sock.ev.on('creds.update', saveCreds);

            // Set a timeout to clean up if no QR is generated
            setTimeout(() => {
                if (!responseSent) {
                    responseSent = true;
                    const errorResponse = formatQRErrorMessage('timeout');
                    res.status(errorResponse.status).send(errorResponse.data);
                    removeFile(dirs);
                }
            }, 30000);

        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                const errorResponse = formatQRErrorMessage('unavailable');
                res.status(errorResponse.status).send(errorResponse.data);
            }
            removeFile(dirs);
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