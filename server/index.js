require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
// IMPORTANT: Paste YOUR actual MongoDB link here
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI, { family: 4 })
  .then(() => {
    console.log("✅ DATABASE CONNECTED SUCCESSFULLY!");
    ensureGeneralGroup(); // Create General group on boot if missing
  })
  .catch((err) => console.log("❌ DATABASE ERROR: ", err));

// --- DATABASE SCHEMAS ---
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: { type: String },
  groups: { type: [String], default: ["General"] } // Only General is default now
});

// NEW: Dedicated Group Table
const GroupSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  creator: { type: String },
  members: { type: [String], default: [] },
  pendingRequests: { type: [String], default: [] }
});

const MessageSchema = new mongoose.Schema({
  room: String,
  author: String,
  message: String,
  time: String,
  timestamp: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);
const Group = mongoose.model("Group", GroupSchema);
const Message = mongoose.model("Message", MessageSchema);

// Ensure General Group Exists
async function ensureGeneralGroup() {
  const exists = await Group.findOne({ name: "General" });
  if (!exists) {
    await Group.create({ name: "General", creator: "System", members: [] });
  }
}

// --- AUTHENTICATION ROUTES ---
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const user = await User.create({ username, password: hashedPassword });
    await Group.findOneAndUpdate({ name: "General" }, { $addToSet: { members: username } });
    res.json({ status: "ok" });
  } catch (e) { 
    res.status(400).json({ error: "Username already exists!" }); 
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && await bcrypt.compare(password, user.password)) {
    res.json({ status: "ok", username });
  } else { 
    res.status(400).json({ error: "Invalid Username or Password!" }); 
  }
});

// --- NEW: ADVANCED GROUP MANAGEMENT ROUTES ---

// 1. Fetch User Data (Rooms they are in + Groups they manage)
app.post("/my-data", async (req, res) => {
  const { username } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ error: "User not found" });

  // Find groups this user created to manage requests
  const managedGroups = await Group.find({ creator: username });
  res.json({ status: "ok", groups: user.groups, managedGroups });
});

// 2. Search All Public Groups
app.post("/search-groups", async (req, res) => {
  const { searchTerm } = req.body;
  const groups = await Group.find({ name: { $regex: searchTerm, $options: "i" } });
  res.json({ status: "ok", results: groups });
});

// 3. Create a Group (Sets creator and adds them to members)
app.post("/create-group", async (req, res) => {
  const { username, groupName } = req.body;
  try {
    await Group.create({ name: groupName, creator: username, members: [username] });
    await User.findOneAndUpdate({ username }, { $addToSet: { groups: groupName } });
    res.json({ status: "ok" });
  } catch (e) {
    res.status(400).json({ error: "Group name already exists!" });
  }
});

// 4. Request to Join
app.post("/request-join", async (req, res) => {
  const { username, groupName } = req.body;
  await Group.findOneAndUpdate({ name: groupName }, { $addToSet: { pendingRequests: username } });
  res.json({ status: "ok" });
});

// 5. Approve Join Request
app.post("/approve-join", async (req, res) => {
  const { groupName, targetUser } = req.body;
  // Remove from pending, add to members
  await Group.findOneAndUpdate(
    { name: groupName },
    { $pull: { pendingRequests: targetUser }, $addToSet: { members: targetUser } }
  );
  // Add to User's list
  await User.findOneAndUpdate({ username: targetUser }, { $addToSet: { groups: groupName } });
  res.json({ status: "ok" });
});

// 6. Leave Group
app.post("/leave-group", async (req, res) => {
  const { username, groupName } = req.body;
  if (groupName === "General") return res.status(400).json({ error: "You cannot leave General!" });
  
  await User.findOneAndUpdate({ username }, { $pull: { groups: groupName } });
  await Group.findOneAndUpdate({ name: groupName }, { $pull: { members: username } });
  res.json({ status: "ok" });
});

// --- NEW: AI CHAT ANALYSIS ROUTE ---
app.post("/ai-analyze", async (req, res) => {
  const { room, question } = req.body;
  
  try {
    // 1. Fetch all messages for this specific room from the database
    const messages = await Message.find({ room }).sort({ timestamp: 1 });
    
    // 2. Format the messages into a readable script
    const chatHistory = messages.map(m => `[${m.time}] ${m.author}: ${m.message}`).join("\n");
    
    // 3. Build a strict prompt for Gemini
    const prompt = `
      You are an AI assistant built into a chat app. You are currently analyzing the group chat named "${room}".
      
      Here is the entire chat history for this group:
      ---
      ${chatHistory}
      ---
      
      Based ONLY on the chat history provided above, please answer this user's question: "${question}"
      
      Rules:
      - Keep your answer concise and helpful.
      - If the answer is not mentioned anywhere in the chat history, politely say "I couldn't find any information about that in this group's chat history."
      - Do not make up outside information.
    `;

    // 4. Send to Gemini and wait for the answer
    const result = await aiModel.generateContent(prompt);
    const answer = result.response.text();

    res.json({ status: "ok", answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to analyze chat." });
  }
});

// --- SOCKET.IO ---
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.on("join_room", async (room) => {
    socket.join(room);
    const previousMessages = await Message.find({ room }).sort({ timestamp: 1 }).limit(50);
    socket.emit("load_messages", previousMessages);
  });

  socket.on("send_message", async (data) => {
    const newMessage = new Message(data);
    await newMessage.save();
    socket.to(data.room).emit("receive_message", data);
  });
});

server.listen(3001, () => console.log("SERVER RUNNING ON PORT 3001"));