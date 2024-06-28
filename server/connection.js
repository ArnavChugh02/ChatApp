const mongoose = require('mongoose');

const url = 'mongodb+srv://arnavchugh02:arnavchugh02@cluster0.lhf020g.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Connected to DB')).catch((e) => console.log('Error ',e))