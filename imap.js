const tls = require('tls');
const fs = require('fs');
const { constrainedMemory } = require('process');
const mysql = require('mysql2');

// Database connection configuration
const dbConfig = {
    host: 'root.node.webworkshub.online',
    port: 3306,
    user: 'u66_4FQxNSTmFZ',
    password: 'lCnkQYTXBXl.O2y5bR@UKhKJ',
    database: 's66_mail'
};


// Server configurations
const HOST = '0.0.0.0';
const PORT = 1042; // Default port for IMAP over SSL/TLS

// Paths to your certificate and key files
const CERT_PATH = '/home/container/certs/fullchain.pem';
const KEY_PATH = '/home/container/certs/privkey.pem';

// Hardcoded credentials for testing
const VALID_USERNAME = 'test@mjdawson.net';
const VALID_PASSWORD = 'password123';

var currentUID = 2;

const mailboxes = {
    'INBOX': [
        {
            id: `1`,
            from: `MSG-1@mjdawson.net`,
            to: 'test@mjdawson.net',
            subject: `Message 1`,
            bodyPlain: `EMAIL 1`,
            date: '2024-08-20',
            flags: []
        },
        {
            id: `2`,
            from: `MSG-1@mjdawson.net`,
            to: 'test@mjdawson.net',
            subject: `Message 2`,
            bodyPlain: `EMAIL 2`,
            date: '2024-08-20',
            flags: []
        }
    ],
    'Sent': [],
    'Drafts': [],
    'Trash': [],
};
var currentMailbox;

const options = {
    key: fs.readFileSync(KEY_PATH),
    cert: fs.readFileSync(CERT_PATH),
};

const server = tls.createServer(options, (socket) => {
    console.log('Client connected.');

    socket.write('* OK IMAP4rev1 Service Ready\r\n');

    socket.on('data', (data) => {
        const command = data.toString().trim();
        console.log('Received command:', command);
        handleCommand(socket, command);
    });

    socket.on('end', () => {
        console.log('Client disconnected.');
    });

    socket.on('error', (err) => {
        console.error('Socket error:', err);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`IMAP server is running at ${HOST}:${PORT}`);
});
function handleCommand(socket, command) {
    // console.log(mailboxes);
    if (!command) {
        console.log('No command received');
        return;
    }

    const [tag, cmd, ...args] = command.split(' ');

    if (!cmd) {
        socket.write(`${tag} BAD Command unrecognized\r\n`);
        return;
    }

    switch (cmd.toUpperCase()) {
        case 'CAPABILITY':
            handleCapability(socket, tag);
            break;
        case 'STARTTLS':
            // This command should not be used with TLS, so ignore it or respond with an error
            socket.write(`${tag} NO STARTTLS not supported\r\n`);
            break;
        case 'LOGIN':
            handleLogin(socket, tag, args);
            break;
        case 'LIST':
            handleList(socket, tag, args);
            break;
        case 'SELECT':
            handleSelect(socket, tag, args);
            break;
        case 'FETCH':
            handleFetch(socket, tag, args);
            break;
        case 'CREATE':
            handleCreate(socket, tag, args);
            break;
        case 'LOGOUT':
            handleLogout(socket, tag);
            break;
        case 'NAMESPACE':
            handleNamespace(socket, tag);
            break;
        case 'UID':
            handleUid(socket, tag, args);
            break;
        case 'EXPUNGE':
            expunge(socket, tag, args);
            break;
        case 'STORE':
            store(socket, tag, args);
            break;
        case 'REFRESH_MAIL':
            refreshMail();
            socket.write(`${tag} Thanks Bro\r\n`);
            break;
        default:
            socket.write(`${tag} BAD Command unrecognized\r\n`);
            break;
    }
}
function handleCapability(socket, tag) {
    socket.write('* IMAP4rev1 UNSELECT IDLE NAMESPACE QUOTA ID XLIST CHILDREN X-GM-EXT-1 UIDPLUS COMPRESS=DEFLATE ENABLE MOVE CONDSTORE ESEARCH UTF8=ACCEPT LIST-EXTENDED LIST-STATUS LITERAL- SPECIAL-USE APPENDLIMIT=35651584\r\n');
    socket.write(`${tag} OK CAPABILITY completed\r\n`);
}
function handleNamespace(socket, tag) {
    socket.write('* NAMESPACE (("" "/")) NIL NIL\r\n');
    socket.write(`${tag} OK NAMESPACE command completed\r\n`);
    // socket.end();  // Flushes the socket and ends the response
}
function handleCreate(socket, tag, args) {
    const mailboxName = args[0];
    if (mailboxName && !mailboxes[mailboxName]) {
        mailboxes[mailboxName] = [];  // Create the mailbox if it doesn't exist
        socket.write(`${tag} OK CREATE completed\r\n`);
    } else {
        socket.write(`${tag} NO CREATE failed: Mailbox already exists\r\n`);
    }
}
function handleLogin(socket, tag, args) {
    // Join the args array and handle quoted strings
    const rawArgs = args.join(' ').replace(/"/g, ''); // Remove all quotes
    const [username, password] = rawArgs.split(' ').map(arg => arg.trim());

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
        socket.write(`${tag} OK LOGIN completed\r\n`);
    } else {
        socket.write(`${tag} NO LOGIN failed\r\n`);
    }
}
function handleList(socket, tag, args) {
    // Iterate over the mailboxes and send a LIST response for each
    for (const [mailbox, _] of Object.entries(mailboxes)) {
        socket.write(`* LIST (\\HasNoChildren) "/" "${mailbox}"\r\n`);
    }
    
    // Send completion response
    socket.write(`${tag} OK LIST completed\r\n`);
}
function handleSelect(socket, tag, args) {
    const mailbox = args[0].replace(/"/g, '');  // Remove any quotes

    if (mailboxes[mailbox]) {
        currentMailbox = mailbox;  // Set the current mailbox
        const messages = mailboxes[mailbox];
        socket.write(`* ${messages.length} EXISTS\r\n`);
        socket.write(`* ${messages.length} RECENT\r\n`);
        socket.write(`${tag} OK [READ-WRITE] SELECT completed\r\n`);
    } else {
        socket.write(`${tag} NO Mailbox does not exist\r\n`);
    }
}
function handleUid(socket, tag, args){
    const type = args[0];

    if(!type){
        socket.write(`${tag} BAD Unknown command: UID\r\n`);
        return;
    }

    if(type.toUpperCase() == 'FETCH'){ handleUidFetch(socket, tag, args); return; }  // UID Fetch operation
    if(type.toUpperCase() == 'STORE'){ handleUidStore(socket, tag, args); return; }  // UID Store operation
    if(type.toUpperCase() == 'COPY'){ handleUidCopy(socket, tag, args); return; }  // UID Copy operation
    socket.write(`${tag} BAD Unknown command: UID\r\n`);
    return;
}
function handleUidCopy(socket, tag, args) {
    if (!args || args.length < 3) {
        socket.write(`${tag} BAD COPY command format\r\n`);
        return;
    }

    // Extract UID list and new mailbox name from arguments
    const uids = parseIMAPSequence(args[1], 10);
    const newMailboxName = removeQuotesIfEnclosed(args.slice(2).join(' '));

    // Ensure the new mailbox exists
    if (!mailboxes[newMailboxName]) {
        socket.write(`${tag} NO [TRYCREATE] No folder ${newMailboxName} (Failure)\r\n`);
        return;
    }

    // Iterate over UIDs to perform copy operations
    uids.forEach(uid => {
        let messageFound = false;
        let sequenceNumber = -1;
        let messageToCopy = null;

        // Search for the message across all mailboxes
        for (const mailboxName in mailboxes) {
            if (mailboxes.hasOwnProperty(mailboxName)) {
                const messages = mailboxes[mailboxName];
                const messageIndex = messages.findIndex(msg => msg.id === uid.toString());

                if (messageIndex !== -1) {
                    // Message found in the current mailbox
                    messageFound = true;
                    sequenceNumber = messageIndex + 1; // Sequence number is 1-based
                    messageToCopy = messages[messageIndex];

                    // Check if it is a delete
                    // if (newMailboxName == 'Trash'){
                    //     messages.splice(messageIndex, 1)
                    // }

                    break; // Exit the loop as we've found the message
                }
            }
        }

        if (!messageFound) {
            // UID not found in any mailbox
            socket.write(`${tag} NO [UID NOT FOUND] UID ${uid} not found\r\n`);
            return;
        }

        // Copy the message to the new mailbox
        const newMailbox = mailboxes[newMailboxName];

        // Deep copy the message and assign a new UID
        const newMessage = deepCopy(messageToCopy);
        currentUID++;
        newMessage.id = currentUID.toString();

        // Add the copied message to the new mailbox
        newMailbox.push(newMessage);

        // Send response with sequence number and UID copy information
        let response = `* ${sequenceNumber} OK [COPYUID ${sequenceNumber} ${uid} ${newMessage.id}] (Success)\r\n`;
        socket.write(response);
    });

    // Final response
    socket.write(`${tag} OK Success\r\n`);
}
function handleUidFetch(socket, tag, args) {
    const fetchArgs = args;
    if (!fetchArgs) {
        socket.write(`${tag} BAD FETCH command format\r\n`);
        return;
    }

    const uids = parseIMAPSequence(fetchArgs[1], 10);

    var failed = false;

    uids.forEach(uid => {
        const messages = mailboxes[currentMailbox] || [];
        const message = messages.find(message => message.id === uid.toString());

        if (!message) {
            socket.write(`${tag} OK Success\r\n`);
            failed = true;
            return;
        }

        const seqNumber = messages.findIndex(msg => msg.id === message.id)+1;

        const fetchItems = fetchArgs.slice(2).join(' ');

        // Ensure valid sequence number
        if (isNaN(seqNumber) || seqNumber <= 0) {
            socket.write(`${tag} BAD FETCH sequence number\r\n`);
            return;
        }

        // Prepare the response based on the requested fetch items
        let response = `* ${seqNumber} FETCH (UID ${uid} `;

        // Process the fetch items string
        const fetchItemList = parseFetchItems(fetchItems); // Split by spaces before uppercase words

        fetchItemList.forEach((item, index) => {
            let processed = false;
            const bodySizePlain = Buffer.byteLength(message.bodyPlain, 'utf-8') + 2;

            switch (true) {
                case /^UID$/.test(item):
                    response += `UID ${uid}`;
                    processed = true;
                    break;

                case /^FLAGS$/.test(item):
                    let flags = "";
                    message.flags.forEach(flag => {
                        flags += flag + ' ';
                    });
                    flags = flags.slice(0, -1); // Remove the last extra space
                    response += `FLAGS (${flags})`;
                    processed = true;
                    break;

                case /^INTERNALDATE$/.test(item):
                    const internalDate = formatDate(message.date);
                    response += `INTERNALDATE "${internalDate}"`;
                    processed = true;
                    break;

                case /^BODY\[TEXT\]$/.test(item):
                    response += `BODY[TEXT] {${bodySizePlain}}\r\n${message.bodyPlain}\r\n`;
                    processed = true;
                    break;

                case /^BODYSTRUCTURE$/.test(item):
                    const bodyStructure = `("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "QUOTED-PRINTABLE" ${bodySizePlain} NIL NIL NIL NIL)`;
                    response += `BODYSTRUCTURE (${bodyStructure})`;
                    processed = true;
                    break;

                case /^BODY\.PEEK\[HEADER\.FIELDS/.test(item): // Handle BODY.PEEK[HEADER.FIELDS ( ... )]
                    const headers = [
                        `To: ${message.to}`,
                        `Message-ID: <${message.id}>`,
                        `Date: ${formatDate(message.date)}`,
                        `Reply-To: ${message.from}`,
                        `Subject: ${message.subject}`,
                        `From: ${message.from}`
                        // Add other necessary headers
                    ].join('\r\n');
                    const headerSize = Buffer.byteLength(headers + '\r\n', 'utf-8');
                    response += `BODY[HEADER.FIELDS (MESSAGE-ID SUBJECT DATE IN-REPLY-TO REFERENCES FROM TO CC BCC REPLY-TO Gmail-Client-Draft-ID Gmail-Client-Draft-Thread-ID)] {${headerSize}}\r\n${headers}\r\n`;
                    processed = true;
                    break;
                case /^BODY\.PEEK\[2\]$/.test(item):
                    response += `BODY[2] {${bodySizePlain}}\r\n${message.bodyPlain}\r\n`
                    processed = true;
                    break;

                case /^SUBJECT$/.test(item):
                    break;
                case /^MESSAGE-ID$/.test(item):
                    break;
                case /^DATE$/.test(item):
                    break;
                case /^IN-REPLY-TO$/.test(item):
                    break;
                case /^REFERENCES$/.test(item):
                    break;
                case /^FROM$/.test(item):
                    break;
                case /^TO$/.test(item):
                    break;
                case /^CC$/.test(item):
                    break;
                case /^BCC$/.test(item):
                    break;
                case /^REPLY-TO$/.test(item):
                    break;
                case /^Gmail-Client-Draft-ID$/.test(item):
                    break;
                case /^Gmail-Client-Draft-Thread-ID\]$/.test(item):
                    break;

                default:
                    socket.write(`${tag} BAD FETCH item: ${item}\r\n`);
                    processed = false;
                    break;
            }

            if (processed && index < fetchItemList.length - 1) {
                response += ' '; // Add space between items
            }
        });

        response = response+')\r\n'; // End the response
        socket.write(response);
    });
    if(!failed){
        socket.write(`${tag} OK Success\r\n`);
    }
}
function handleUidStore(socket, tag, args) {
    const fetchArgs = args;
    if (!fetchArgs) {
        socket.write(`${tag} BAD STORE command format\r\n`);
        return;
    }

    const uids = parseIMAPSequence(fetchArgs[1], 10);

    uids.forEach(uid => {
        const messages = mailboxes[currentMailbox] || [];
        const message = messages.find(message => message.id === uid.toString());

        if (!message) {
            socket.write(`${tag} OK Success\r\n`);
            return;
        }

        const seqNumber = messages.findIndex(msg => msg.id === message.id)+1;

        const fetchItem = fetchArgs[2];
        const itemsList = parseFetchItems(fetchArgs.slice(3).join(' '));

        // Ensure valid sequence number
        if (isNaN(seqNumber) || seqNumber <= 0) {
            socket.write(`${tag} BAD STORE sequence number\r\n`);
            return;
        }

        // Prepare the response based on the requested fetch items
        let response = `* ${seqNumber} STORE (UID ${uid} `;
        let processed = false;
        var flags = ""; // I don't understand enough to know why I can't put this is the actual case, but, vscode don't like it, so it goes here

        switch (true) {
            case /^\+FLAGS\.SILENT$/.test(fetchItem):
                flags = "";
                message.flags.forEach(flag => {
                    flags += flag + ' ';
                });
                flags = flags.slice(0, -1); // Remove the last extra space
                response += `FLAGS (${flags})`;

                // Actually update the message flags
                itemsList.forEach(flag => {
                    // Check it's not already in the list
                    if(!message.flags.includes(flag)){
                        message.flags.push(flag);
                    }
                });

                processed = true;
                break;

            case /^-FLAGS\.SILENT$/.test(fetchItem):
                flags = "";
                message.flags.forEach(flag => {
                    flags += flag + ' ';
                });
                flags = flags.slice(0, -1); // Remove the last extra space
                response += `FLAGS (${flags})`;
            
                // Actually update the message flags by removing the specified flags
                itemsList.forEach(flag => {
                    // Check if it's in the list and remove it
                    const index = message.flags.indexOf(flag);
                    if(index !== -1) {
                        message.flags.splice(index, 1); // Remove the flag at the found index
                    }
                });
                    
                processed = true;
                break;

            default:
                socket.write(`${tag} BAD STORE\r\n`);
                processed = false;
                break;
        }

        response = response+')\r\n'; // End the response
        socket.write(response);
    });
    socket.write(`${tag} OK Success\r\n`);
}
function handleFetch(socket, tag, args) {
    const fetchArgs = args;
    if (!fetchArgs) {
        socket.write(`${tag} BAD FETCH command format\r\n`);
        return;
    }

    const seqNumbers = parseIMAPSequence(fetchArgs[0], 10);

    seqNumbers.forEach(seqNumber => {
        const fetchItems = fetchArgs.slice(1).join(' ');

        // Ensure valid sequence number
        if (isNaN(seqNumber) || seqNumber <= 0) {
            socket.write(`${tag} BAD FETCH sequence number\r\n`);
            return;
        }
        const messages = mailboxes[currentMailbox] || [];
        const message = messages[(seqNumber - 1)];

        if (!message) {
            socket.write(`${tag} NO FETCH failed: no such message\r\n`);
            return;
        }

        const uid = message.id;

        // Prepare the response based on the requested fetch items
        let response = `* ${seqNumber} FETCH (`;

        // Process the fetch items string
        const fetchItemList = parseFetchItems(fetchItems); // Split by spaces before uppercase words

        fetchItemList.forEach((item, index) => {
            let processed = false;
            const bodySizePlain = Buffer.byteLength(message.bodyPlain, 'utf-8')  + 2;

            switch (true) {
                case /^UID$/.test(item):
                    response += `UID ${uid}`;
                    processed = true;
                    break;

                case /^FLAGS$/.test(item):
                    let flags = "";
                    message.flags.forEach(flag => {
                        flags += flag + ' ';
                    });
                    flags = flags.slice(0, -1); // Remove the last extra space
                    response += `FLAGS (${flags})`;
                    processed = true;
                    break;

                case /^INTERNALDATE$/.test(item):
                    const internalDate = formatDate(message.date);
                    response += `INTERNALDATE "${internalDate}"`;
                    processed = true;
                    break;

                case /^BODY\[TEXT\]$/.test(item):
                    response += `BODY[TEXT] {${bodySizePlain}}\r\n${message.bodyPlain}\r\n`;
                    processed = true;
                    break;

                case /^BODYSTRUCTURE$/.test(item):
                    const bodyStructure = `("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" ${bodySizePlain} 1 NIL NIL NIL)("TEXT" "HTML" ("CHARSET" "UTF-8") NIL NIL "7BIT" ${bodySizePlain+21} 2 NIL NIL NIL) "ALTERNATIVE" ("BOUNDARY" "000000000000aadb010620eba5d5") NIL NIL`;
                    response += `BODYSTRUCTURE (${bodyStructure})`;
                    processed = true;
                    break;

                case /^BODY\.PEEK\[HEADER\.FIELDS/.test(item):
                    const headers = [
                        `To: ${message.to}`,
                        `Message-ID: <${message.id}>`,
                        `Date: ${formatDate(message.date)}`,
                        `Reply-To: ${message.from}`,
                        `Subject: ${message.subject}`,
                        `From: ${message.from}`
                        // Add other necessary headers
                    ].join('\r\n')
                    const headerSize = Buffer.byteLength(headers + '\r\n', 'utf-8');
                    response += `BODY[HEADER.FIELDS (MESSAGE-ID SUBJECT DATE IN-REPLY-TO REFERENCES FROM TO CC BCC REPLY-TO Gmail-Client-Draft-ID Gmail-Client-Draft-Thread-ID)] {${headerSize}}\r\n${headers}\r\n`;
                    processed = true;
                    break;
                case /^BODY\.PEEK\[1\]$/.test(item):
                    response += `BODY[1] {${bodySizePlain}}\r\n${message.bodyPlain}\r\n`
                    processed = true;
                    break;

                case /^SUBJECT$/.test(item):
                    break;
                case /^MESSAGE-ID$/.test(item):
                    break;
                case /^DATE$/.test(item):
                    break;
                case /^IN-REPLY-TO$/.test(item):
                    break;
                case /^REFERENCES$/.test(item):
                    break;
                case /^FROM$/.test(item):
                    break;
                case /^TO$/.test(item):
                    break;
                case /^CC$/.test(item):
                    break;
                case /^BCC$/.test(item):
                    break;
                case /^REPLY-TO$/.test(item):
                    break;
                case /^Gmail-Client-Draft-ID$/.test(item):
                    break;
                case /^Gmail-Client-Draft-Thread-ID\]$/.test(item):
                    break;

                default:
                    socket.write(`${tag} BAD FETCH item: ${item}\r\n`);
                    processed = false;
                    break;
            }

            if (processed && index < fetchItemList.length - 1) {
                response += ' '; // Add space between items
            }
        });

        response = response.trim()+'\r\n)\r\n'; // End the response
        socket.write(response);
    });
    socket.write(`${tag} OK FETCH completed\r\n`);
}
function parseFetchItems(fetchItemsString) {
    const items = fetchItemsString.trim().replace(/\(/g, '').replace(/\)/g, '').split(' ');
    return items;
}
function handleLogout(socket, tag) {
    socket.write('* BYE IMAP4rev1 Server logging out\r\n');
    socket.write(`${tag} OK LOGOUT completed\r\n`);
    socket.end();
}
function expunge(socket, tag, args) {
    const messages = mailboxes[currentMailbox];
    const markedForRemoval = [];

    let response = '';

    // Collect indices of messages to remove, iterating backward to avoid index shifting issues
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].flags.includes('\\DELETED')) {
            markedForRemoval.push(i);
        }
    }

    // Remove messages using the collected indices
    markedForRemoval.forEach(indexToRemove => {
        messages.splice(indexToRemove, 1);
        response += `* ${indexToRemove+1} EXPUNGE\r\n`;
    });

    // Optional: Send response to the client
    socket.write(response);
    socket.write(`${tag} OK Success\r\n`);
}
function formatDate(inputDate) {
    // Parse the input date (assumed to be in 'YYYY-MM-DD' format)
    const date = new Date(inputDate);

    // Helper function to format number with leading zero if needed
    const padZero = (num) => num.toString().padStart(2, '0');

    // Format the day, month, and year
    const day = padZero(date.getUTCDate());
    const month = date.toLocaleString('en-GB', { month: 'short' }).replace('.', ''); // e.g., "Aug"
    const year = date.getUTCFullYear();

    // Format the time part
    const hours = padZero(date.getUTCHours());
    const minutes = padZero(date.getUTCMinutes());
    const seconds = padZero(date.getUTCSeconds());

    // Construct the final formatted string
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds} +0000`;
}
function store(socket, tag, args){
    const fetchArgs = args;
    if (!fetchArgs) {
        socket.write(`${tag} BAD FETCH command format\r\n`);
        return;
    }

    const seqNumbers = parseIMAPSequence(fetchArgs[0], 10);

    seqNumbers.forEach(seqNumber => {
        // Ensure valid sequence number
        if (isNaN(seqNumber) || seqNumber <= 0) {
            socket.write(`${tag} BAD FETCH sequence number\r\n`);
            return;
        }
        const messages = mailboxes[currentMailbox] || [];
        const message = messages[(seqNumber - 1)];

        if (!message) {
            socket.write(`${tag} NO FETCH failed: no such message\r\n`);
            return;
        }

        const uid = message.id;

        const fetchItem = fetchArgs[1];
        const itemsList = parseFetchItems(fetchArgs.slice(2).join(' '));

        // Ensure valid sequence number
        if (isNaN(seqNumber) || seqNumber <= 0) {
            socket.write(`${tag} BAD STORE sequence number\r\n`);
            return;
        }

        // Prepare the response based on the requested fetch items
        let response = `* ${seqNumber} STORE (UID ${uid} `;
        let processed = false;
        var flags = ""; // I don't understand enough to know why I can't put this is the actual case, but, vscode don't like it, so it goes here

        switch (true) {
            case /^\+FLAGS\.SILENT$/.test(fetchItem):
                flags = "";
                message.flags.forEach(flag => {
                    flags += flag + ' ';
                });
                flags = flags.slice(0, -1); // Remove the last extra space
                response += `FLAGS (${flags})`;

                // Actually update the message flags
                itemsList.forEach(flag => {
                    // Check it's not already in the list
                    if(!message.flags.includes(flag)){
                        message.flags.push(flag);
                    }
                });

                processed = true;
                break;

            case /^-FLAGS\.SILENT$/.test(fetchItem):
                flags = "";
                message.flags.forEach(flag => {
                    flags += flag + ' ';
                });
                flags = flags.slice(0, -1); // Remove the last extra space
                response += `FLAGS (${flags})`;
            
                // Actually update the message flags by removing the specified flags
                itemsList.forEach(flag => {
                    // Check if it's in the list and remove it
                    const index = message.flags.indexOf(flag);
                    if(index !== -1) {
                        message.flags.splice(index, 1); // Remove the flag at the found index
                    }
                });
                    
                processed = true;
                break;

            default:
                socket.write(`${tag} BAD STORE\r\n`);
                processed = false;
                break;
        }
        response = response+')\r\n'; // End the response
        socket.write(response);
    });
    socket.write(`${tag} OK Success\r\n`);
}
// Function that takes a string like like 2:*, 2, or 1:2 and return all the values it needs to fetch
function parseIMAPSequence(sequence, x) {
    let totalMessages = 0;

    for (const mailbox in mailboxes) {
        totalMessages += mailboxes[mailbox].length;
    }
    const result = [];

    // Split the sequence by commas, in case of multiple sequences.
    const sequences = sequence.split(',');

    sequences.forEach(seq => {
        const parts = seq.split(':');

        if (parts.length === 1) {
            // Single number case (e.g., '2')
            const num = parseInt(parts[0], 10);
            if (!isNaN(num) && num >= 1 && num <= totalMessages) {
                result.push(num);
            }
        } else if (parts.length === 2) {
            // Range case (e.g., '2:*' or '1:3')
            const start = parseInt(parts[0], 10);
            const end = parts[1] === '*' ? totalMessages : parseInt(parts[1], 10);

            if (!isNaN(start) && start >= 1 && !isNaN(end) && end >= 1) {
                for (let i = start; i <= end; i++) {
                    result.push(i);
                }
            }
        }
    });

    return result;
}
function removeQuotesIfEnclosed(str) {
    // Check if the string is enclosed in double quotes
    if (str.startsWith('"') && str.endsWith('"') && str.length > 1) {
        // Remove the quotes
        return str.slice(1, -1);
    }
    // Return the string as is if not enclosed in quotes
    return str;
}
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}
async function refreshMail() {
    // Create a connection to the database
    const connection = mysql.createConnection(dbConfig);

    // Promisify the query function
    const query = (sql, params) => {
        return new Promise((resolve, reject) => {
            connection.query(sql, params, (error, results) => {
                if (error) {
                    return reject(error);
                }
                resolve(results);
            });
        });
    };

    try {
        // Connect to the database
        connection.connect();

        // SQL query to select all emails
        const sql = 'SELECT id, mailFrom AS `from`, mailTo AS `to`, subject, HTML_body AS bodyPlain FROM emails';

        // Execute the query
        const rows = await query(sql);

        // Map the results to the desired JSON structure
        const emails = rows.map(row => ({
            id: row.id.toString(), // Ensure id is a string
            from: row.from,
            to: row.to,
            subject: row.subject,
            bodyPlain: row.bodyPlain,
            date: '2024-08-20', // You need to modify this if your data has actual date fields
            flags: [] // No flags in your table, so this is an empty array
        }));

        mailboxes['INBOX'] = emails;

    } catch (error) {
        console.error('Error fetching emails:', error);
    } finally {
        // End the database connection
        connection.end();
    }
}
