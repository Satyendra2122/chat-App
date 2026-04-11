require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Allows your Vercel frontend to connect
    methods: ["GET", "POST"],
  },
});

// --- 1. INITIALIZE GEMINI AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- 2. MONGODB CONNECTION ---
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DATABASE CONNECTED"))
  .catch((err) => console.log("❌ DATABASE ERROR: ", err));

// --- 3. DATABASE SCHEMAS ---
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  groups: { type: [String], default: ["General"] }
});
const User = mongoose.model("User", UserSchema);

const RoomSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  admin: { type: String, required: true },
  pendingRequests: { type: [String], default: [] }
});
const Room = mongoose.model("Room", RoomSchema);

const MessageSchema = new mongoose.Schema({
  room: String,
  author: String,
  message: String,
  time: String,
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

// --- 4. API ROUTES ---

// Auth: Register
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: "Username taken" });
    
    const newUser = new User({ username, password });
    await newUser.save();
    res.json({ status: "ok" });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Auth: Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username, password });
    if (user) { res.json({ status: "ok" }); } 
    else { res.status(400).json({ error: "Invalid credentials" }); }
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Fetch User's Data & Groups
app.post("/my-data", async (req, res) => {
  const { username } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "User not found" });

    const managedGroups = await Room.find({ admin: username });
    res.json({ status: "ok", groups: user.groups, managedGroups });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Group: Create
app.post("/create-group", async (req, res) => {
  const { username, groupName } = req.body;
  try {
    const existingRoom = await Room.findOne({ name: groupName });
    if (existingRoom) return res.status(400).json({ error: "Group name taken" });

    const newRoom = new Room({ name: groupName, admin: username });
    await newRoom.save();

    await User.updateOne({ username }, { $push: { groups: groupName } });
    res.json({ status: "ok" });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Group: Leave
app.post("/leave-group", async (req, res) => {
  const { username, groupName } = req.body;
  if (groupName === "General") return res.status(400).json({ error: "Cannot leave General" });
  try {
    await User.updateOne({ username }, { $pull: { groups: groupName } });
    res.json({ status: "ok" });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Group: Search
app.post("/search-groups", async (req, res) => {
  const { searchTerm } = req.body;
  try {
    const rooms = await Room.find({ name: { $regex: searchTerm, $options: "i" } });
    res.json({ status: "ok", results: rooms });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Group: Request Join
app.post("/request-join", async (req, res) => {
  const { username, groupName } = req.body;
  try {
    await Room.updateOne({ name: groupName }, { $addToSet: { pendingRequests: username } });
    res.json({ status: "ok" });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// Group: Approve Join
app.post("/approve-join", async (req, res) => {
  const { groupName, targetUser } = req.body;
  try {
    await Room.updateOne({ name: groupName }, { $pull: { pendingRequests: targetUser } });
    await User.updateOne({ username: targetUser }, { $addToSet: { groups: groupName } });
    res.json({ status: "ok" });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// --- 5. GOOGLE GEMINI AI ROUTE ---
app.post("/ai-analyze", async (req, res) => {
  const { room, question } = req.body;
  try {
    const messages = await Message.find({ room }).sort({ timestamp: 1 });
    
    if (messages.length === 0) {
      return res.json({ status: "ok", answer: "There are no messages in this group yet for me to analyze!" });
    }

    const chatHistory = messages.map(m => `[${m.time}] ${m.author}: ${m.message}`).join("\n");
    
    const prompt = `
      You are an AI assistant built into a chat app. You are analyzing the group chat "${room}".
      Here is the entire chat history:
      ---
      ${chatHistory}
      ---
      Based ONLY on the chat history above, answer this user's question: "${question}"
      Keep your answer concise. If the answer is not in the chat history, say "I couldn't find any information about that in this group's chat history."
    `;

    const result = await aiModel.generateContent(prompt);
    const answer = result.response.text();
    res.json({ status: "ok", answer });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: "Failed to analyze chat." });
  }
});

// --- 6. SOCKET.IO (REAL-TIME CHAT) ---
io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  socket.on("join_room", async (room) => {
    socket.join(room);
    // Send previous messages to the user joining
    const messages = await Message.find({ room }).sort({ timestamp: 1 });
    socket.emit("load_messages", messages);
  });

  socket.on("send_message", async (data) => {
    // Save message to database
    const newMessage = new Message(data);
    await newMessage.save();

    // Send to everyone else in the room
    socket.to(data.room).emit("receive_message", data);
  });

  socket.on("disconnect", () => {
    console.log(`User Disconnected: ${socket.id}`);
  });
});

// --- 7. START SERVER ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
});