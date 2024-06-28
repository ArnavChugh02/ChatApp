const express = require('express');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const io = require('socket.io')(8090, {
    cors: {
        origin: '*',
    }
});

// Connect to DB
require('./connection');

// Import Files
const Users = require('./models/Users');
const Conversation = require('./models/Conversation');
const Messages = require('./models/Messages');

// app use
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

const port = process.env.PORT || 5050;

// Socket.io
let users = [];
io.on('connection', socket => {
    console.log('User connected', socket.id);
    socket.on('addUser', userId => {
        const isUserExist = users.find(user => user.userId === userId);
        if (!isUserExist) {
            const user = { userId, socketId: socket.id };
            users.push(user);
            io.emit('getUsers', users);
        }
    });

    socket.on('sendMessage', async ({ senderId, receiverId, message, conversationId }) => {
        const receiver = users.find(user => user.userId === receiverId);
        const sender = users.find(user => user.userId === senderId);
        const user = await Users.findById(senderId);
        console.log('sender :>> ', sender, receiver);
        if (receiver) {
            io.to(receiver.socketId).to(sender.socketId).emit('getMessage', {
                senderId,
                message,
                conversationId,
                receiverId,
                user: { id: user._id, fullName: user.fullName, email: user.email }
            });
            }else {
                io.to(sender.socketId).emit('getMessage', {
                    senderId,
                    message,
                    conversationId,
                    receiverId,
                    user: { id: user._id, fullName: user.fullName, email: user.email }
                });
            }
        });

    socket.on('disconnect', () => {
        users = users.filter(user => user.socketId !== socket.id);
        io.emit('getUsers', users);
    });
    // io.emit('getUsers', socket.userId);
});

// Routes
app.get('/', (req, res) => {
    res.send('Welcome');
});

app.post('/api/register', async (req, res, next) => {
    try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).send('Please fill all required fields');
        } else {
            const isAlreadyExist = await Users.findOne({ email });
            if (isAlreadyExist) {
                return res.status(400).send('User already exists');
            } else {
                const newUser = new Users({ fullName, email });
                bcryptjs.hash(password, 10, async (err, hashedPassword) => {
                    if (err) return next(err);
                    newUser.set('password', hashedPassword);
                    await newUser.save();
                    return res.status(200).send('User registered successfully');
                });
            }
        }
    } catch (error) {
        console.log(error);
        return res.status(500).send('Server error');
    }
});

app.post('/api/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).send('Please fill all required fields');
        } else {
            const user = await Users.findOne({ email });
            if (!user) {
                return res.status(400).send('User email or password is incorrect');
            } else {
                const validateUser = await bcryptjs.compare(password, user.password);
                if (!validateUser) {
                    return res.status(400).send('User email or password is incorrect');
                } else {
                    const payload = {
                        userId: user._id,
                        email: user.email,
                    };
                    const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'THIS_IS_A_JWT_SECRET_KEY';
                    jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: 84600 }, async (err, token) => {
                        await Users.updateOne({ _id: user._id }, { $set: { token } });
                        user.save();
                        res.status(200).json({ user: { id: user._id, email: user.email, fullName: user.fullName }, token: token });
                    });

                    
                }
            }
        }
    } catch (error) {
        console.log(error);
        return res.status(500).send('Server error');
    }
});

app.post('/api/conversation', async (req, res) => {
    try {
        const { senderId, receiverId } = req.body;

        console.log(`Creating conversation with senderId: ${senderId}, receiverId: ${receiverId}`);

        if (!senderId || !receiverId) {
            return res.status(400).send('Both senderId and receiverId are required');
        }

        // Ensure both users exist
        const sender = await Users.findById(senderId);
        const receiver = await Users.findById(receiverId);
        
        if (!sender || !receiver) {
            return res.status(400).send('Both sender and receiver must be valid users');
        }

        const newConversation = new Conversation({ members: [senderId, receiverId] });
        await newConversation.save();

        console.log('Conversation created successfully');
        return res.status(200).send('Conversation created successfully');
    } catch (error) {
        console.log(error);
        return res.status(500).send('Server error');
    }
});



app.get('/api/conversation/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        // console.log(`Fetching conversations for userId: ${userId}`);

        // Fetch conversations involving the user
        const conversations = await Conversation.find({ members: { $in: [userId] } });
        // console.log(`Found conversations: ${JSON.stringify(conversations)}`);

        const conversationListUserdata = await Promise.all(
            conversations.map(async (conversation) => {
                const receiverId = conversation.members.find((member) => member !== userId);
                // console.log(`Receiver ID: ${receiverId}`);
                const user = await Users.findById(receiverId);
                // console.log(`Receiver data: ${JSON.stringify(receiver)}`);

                // Return the conversation ID along with receiver's email and fullName
                return {
                    conversationId: conversation._id,
                    user: {
                        receiverId: user._id,
                        email: user.email,
                        fullName: user.fullName
                    }
                };
            })
        );

        // console.log(`Conversation list user data: ${JSON.stringify(conversationListUserdata)}`);
        return res.status(200).json(conversationListUserdata);
    } catch (error) {
        console.log(error, 'Error');
        return res.status(500).send('Server error');
    }
});

app.post('/api/message', async (req, res) => {
    try {
        const {conversationId, senderId, message, receiverId = '' } = req.body;
        if(!senderId || !message) {
            return res.status(400).send('Please fill all required fields');
        }
        if(conversationId === 'new' && receiverId) {
            const newConversation = new Conversation({ members: [senderId, receiverId] });
            await newConversation.save();
            const newMessage = new Messages({ conversationId: newConversation._id, senderId, message });
            await newMessage.save();
            return res.status(400).send('Message sent successfully');
        }
        else if(!conversationId){
            return res.status(400).send('Please fill all required fields');
        }
        const newMessage = new Messages({ conversationId, senderId, message });
        await newMessage.save();
        res.status(200).send('Message sent successfully');
    } catch (error) {
        console.log(error, 'Error')
    }
})

app.get('/api/message/:conversationId', async (req, res) => {
    try {
        const checkMessages = async (conversationId) =>{
            const messages = await Messages.find({ conversationId });
            const messageUserData = Promise.all(messages.map(async (message) => {
            const user = await Users.findById(message.senderId);
            return { user: {id: user._id, email: user.email, fullName: user.fullName }, message: message.message }
        }));
        res.status(200).json(await messageUserData);
        }
        const conversationId = req.params.conversationId;
        if(conversationId === 'new') {
            const checkConversation = await Conversation.find({ members: { $all: [req.query.senderId, req.query.receiverId] }});
            if(checkConversation.length > 0) {
                checkMessages(checkConversation[0]._id);
            }
            else{
                return res.status(200).json([]);
            }
        }
        else{
            checkMessages(conversationId); 
        }
    } catch (error) {
        console.log('Error', error)
    }
})

app.get('/api/users/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const users = await Users.find({ _id: { $ne: userId } });
        const usersData = Promise.all(users.map(async (user) => {
            return { user: { email: user.email, fullName: user.fullName, receiverId: user._id } }
        }));
        res.status(200).json( await usersData);
    } catch (error) {
        console.log('Error', error)
    }
})

app.listen(port, () => {
    console.log('Listening on port ' + port);
});
