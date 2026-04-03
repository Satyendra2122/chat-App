import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

// 🛑 1. PASTE YOUR RENDER URL HERE:
const socket = io.connect('https://chat-app-lz3l.onrender.com');

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(true); 
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  const [currentMessage, setCurrentMessage] = useState("");
  const [messageList, setMessageList] = useState({});
  const [activeRoom, setActiveRoom] = useState("General");
  
  // --- NEW: Mobile View Toggle State ---
  const [isMobileChatView, setIsMobileChatView] = useState(false);
  
  const [rooms, setRooms] = useState([]); 
  const [managedGroups, setManagedGroups] = useState([]); 
  const [searchResults, setSearchResults] = useState([]); 
  const [searchTerm, setSearchTerm] = useState("");

  const scrollRef = useRef();

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messageList, activeRoom, isMobileChatView]);

  const fetchMyData = async (user) => {
    // 🛑 2. PASTE YOUR RENDER URL HERE:
    const response = await fetch(`https://chat-app-lz3l.onrender.com/my-data`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user }),
    });
    const data = await response.json();
    if (data.status === "ok") {
      setRooms(data.groups);
      setManagedGroups(data.managedGroups);
      data.groups.forEach(r => socket.emit("join_room", r));
    }
  };

  const handleAuth = async () => {
    if (!username || !password) return alert("Please enter both username and password!");
    const endpoint = isLoginMode ? "login" : "register";
    try {
      // 🛑 3. PASTE YOUR RENDER URL HERE:
      const response = await fetch(`https://chat-app-lz3l.onrender.com/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (data.status === "ok") {
        setIsLoggedIn(true);
        fetchMyData(username);
      } else { alert(data.error || "Authentication failed"); }
    } catch (error) { alert("Server error."); }
  };

  const sendMessage = async () => {
    if (currentMessage !== "") {
      const messageData = { room: activeRoom, author: username, message: currentMessage, time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }) };
      await socket.emit("send_message", messageData);
      setMessageList(prev => ({ ...prev, [activeRoom]: [...(prev[activeRoom] || []), messageData] }));
      setCurrentMessage("");
    }
  };

  const handleLogout = () => { window.location.reload(); };

  const addNewGroup = async () => {
    const newGroup = prompt("Enter new group name:");
    if (newGroup && newGroup.trim() !== "") {
      // 🛑 4. PASTE YOUR RENDER URL HERE:
      const res = await fetch("https://chat-app-lz3l.onrender.com/create-group", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, groupName: newGroup }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        fetchMyData(username);
        setActiveRoom(newGroup);
        setIsMobileChatView(true); // Open chat on mobile
      } else { alert(data.error); }
    }
  };

  const leaveGroup = async () => {
    if (activeRoom === "General") return alert("You cannot leave the General group!");
    if (!window.confirm(`Leave ${activeRoom}?`)) return;

    // 🛑 5. PASTE YOUR RENDER URL HERE:
    await fetch("https://chat-app-lz3l.onrender.com/leave-group", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, groupName: activeRoom }),
    });
    
    fetchMyData(username);
    setActiveRoom("General");
    setIsMobileChatView(false); // Go back to list on mobile
  };

  useEffect(() => {
    const searchDB = async () => {
      if (searchTerm.trim() === "") { setSearchResults([]); return; }
      // 🛑 6. PASTE YOUR RENDER URL HERE:
      const res = await fetch("https://chat-app-lz3l.onrender.com/search-groups", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchTerm }),
      });
      const data = await res.json();
      if (data.status === "ok") setSearchResults(data.results);
    };
    const timeoutId = setTimeout(() => searchDB(), 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const requestJoin = async (groupName) => {
    // 🛑 7. PASTE YOUR RENDER URL HERE:
    await fetch("https://chat-app-lz3l.onrender.com/request-join", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, groupName }),
    });
    alert(`Request sent to join ${groupName}!`);
    setSearchTerm(""); 
  };

  const approveUser = async (targetUser) => {
    // 🛑 8. PASTE YOUR RENDER URL HERE:
    await fetch("https://chat-app-lz3l.onrender.com/approve-join", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupName: activeRoom, targetUser }),
    });
    alert(`${targetUser} approved!`);
    fetchMyData(username); 
  };

  useEffect(() => {
    const handleReceive = (data) => setMessageList(prev => ({ ...prev, [data.room]: [...(prev[data.room] || []), data] }));
    const handleLoadHistory = (msgs) => { if (msgs.length > 0) setMessageList(prev => ({ ...prev, [msgs[0].room]: msgs })); };
    socket.on("receive_message", handleReceive);
    socket.on("load_messages", handleLoadHistory);
    return () => { socket.off("receive_message", handleReceive); socket.off("load_messages", handleLoadHistory); };
  }, []);

  // --- UI SCREENS ---
  if (!isLoggedIn) {
    return (
      <div className="h-screen bg-[#00a884] flex flex-col items-center justify-center p-4">
        {/* Responsive Login Container */}
        <div className="bg-white p-6 sm:p-10 rounded-lg shadow-2xl w-full max-w-[450px] text-center">
          <div className="text-5xl sm:text-6xl mb-4">💬</div>
          <h1 className="text-xl sm:text-2xl font-light text-gray-600 mb-6">WhatsApp Clone</h1>
          <h2 className="text-md sm:text-lg font-bold text-gray-800 mb-4">{isLoginMode ? "Secure Login" : "Create Account"}</h2>
          <input className="w-full border-b-2 border-whatsapp-green p-3 mb-4 outline-none text-center bg-gray-50" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="w-full border-b-2 border-whatsapp-green p-3 mb-8 outline-none text-center bg-gray-50" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyPress={(e) => e.key === "Enter" && handleAuth()} />
          <button className="w-full bg-[#00a884] hover:bg-[#008f72] text-white py-3 rounded font-medium mb-4 transition-colors" onClick={handleAuth}>{isLoginMode ? "LOGIN" : "REGISTER"}</button>
          <p className="text-sm text-gray-500 cursor-pointer hover:underline" onClick={() => setIsLoginMode(!isLoginMode)}>{isLoginMode ? "Register here" : "Login here"}</p>
        </div>
      </div>
    );
  }

  const currentGroupManaged = managedGroups.find(g => g.name === activeRoom);

  return (
    <div className="h-screen w-screen bg-[#dadbd3] flex items-center justify-center overflow-hidden relative">
      <div className="absolute top-0 w-full h-32 bg-[#00a884] z-0 hidden md:block"></div>
      
      {/* Responsive Main Container: Full screen on mobile, 95vh on desktop */}
      <div className="flex w-full max-w-[1400px] h-screen md:h-[95vh] bg-[#f0f2f5] shadow-2xl z-10 rounded-none md:rounded-lg overflow-hidden">
        
        {/* SIDEBAR - Hides on mobile if a chat is active */}
        <div className={`w-full md:w-[400px] bg-white border-r flex-col ${isMobileChatView ? 'hidden md:flex' : 'flex'}`}>
          <div className="h-16 bg-[#f0f2f5] flex items-center justify-between px-4 border-b">
            <div className="w-10 h-10 bg-gray-400 rounded-full flex items-center justify-center text-white font-bold uppercase shrink-0">{username[0]}</div>
            <div className="flex gap-3 items-center">
              <button onClick={fetchMyData} className="text-[10px] sm:text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded font-bold">🔄 Sync</button>
              <button onClick={handleLogout} className="text-[10px] sm:text-xs font-bold text-red-600 bg-red-100 px-2 py-1 sm:px-3 sm:py-2 rounded">LOGOUT</button>
              <span className="cursor-pointer text-xl" title="Create Group" onClick={addNewGroup}>➕</span>
            </div>
          </div>
          
          <div className="p-2 border-b">
            <div className="bg-[#f0f2f5] flex items-center px-4 py-2 rounded-lg">
              <span className="mr-3">🔍</span>
              <input placeholder="Search global groups to join..." className="bg-transparent outline-none text-sm w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {searchTerm.length > 0 ? (
              <div className="p-2">
                <p className="text-xs text-gray-500 font-bold mb-2 uppercase px-2">Global Search Results</p>
                {searchResults.map((g) => (
                  <div key={g.name} className="flex justify-between items-center p-3 border-b">
                    <span className="font-medium text-gray-800 truncate pr-2">{g.name}</span>
                    {rooms.includes(g.name) ? (
                      <span className="text-xs text-green-600 font-bold">Joined</span>
                    ) : g.pendingRequests.includes(username) ? (
                      <span className="text-xs text-orange-500 font-bold">Pending...</span>
                    ) : (
                      <button onClick={() => requestJoin(g.name)} className="text-xs bg-whatsapp-green text-white px-3 py-1 rounded">Request</button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-500 font-bold mb-2 mt-4 uppercase px-4">My Groups</p>
                {rooms.map((r) => (
                  <div key={r} onClick={() => { setActiveRoom(r); setIsMobileChatView(true); }} className={`flex items-center p-4 cursor-pointer hover:bg-[#f5f6f6] border-b ${activeRoom === r ? 'bg-[#ebebeb]' : ''}`}>
                    <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center text-blue-600 mr-4 font-bold uppercase shrink-0">{r[0]}</div>
                    <span className="font-medium truncate">{r}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* MAIN CHAT - Hides on mobile if list view is active */}
        <div className={`flex-1 flex-col bg-[#efeae2] relative ${!isMobileChatView ? 'hidden md:flex' : 'flex'}`} style={{backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')"}}>
          
          {/* Chat Header */}
          <div className="h-16 bg-[#f0f2f5] flex items-center px-2 sm:px-4 border-b shadow-sm relative">
            
            {/* NEW: Mobile Back Button */}
            <button onClick={() => setIsMobileChatView(false)} className="md:hidden mr-2 text-xl hover:opacity-70 p-2">⬅️</button>
            
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-600 mr-3 sm:mr-4 font-bold uppercase shrink-0">{activeRoom[0]}</div>
            <div className="flex-1 font-medium truncate">{activeRoom}</div>
            
            {/* Admin Management Dropdown */}
            {currentGroupManaged && currentGroupManaged.pendingRequests.length > 0 && (
              <div className="bg-orange-100 text-orange-800 border border-orange-300 p-1 sm:px-3 sm:py-1 rounded text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center gap-1 sm:gap-4 shadow-sm absolute right-16 sm:right-32 z-20">
                <span>🔔 {currentGroupManaged.pendingRequests.length} Pending</span>
                <div className="flex gap-1 sm:gap-2">
                  {currentGroupManaged.pendingRequests.map(user => (
                    <button key={user} onClick={() => approveUser(user)} className="bg-orange-500 hover:bg-orange-600 text-white px-2 py-1 rounded text-[10px] sm:text-xs">Approve {user}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Leave Group Button */}
            {activeRoom !== "General" && (
              <button onClick={leaveGroup} className="text-[10px] sm:text-xs bg-red-100 text-red-700 px-2 py-1 sm:px-3 sm:py-2 rounded font-bold ml-2">🚪 Leave</button>
            )}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-2">
            {(messageList[activeRoom] || []).map((msg, i) => (
              <div key={i} className={`flex ${msg.author === username ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] sm:max-w-[65%] p-2 px-3 rounded-lg shadow-sm relative text-[13px] sm:text-[14.2px] break-words ${msg.author === username ? 'bg-[#dcf8c6] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                  {msg.author !== username && <p className="text-[10px] sm:text-xs font-bold text-orange-600 mb-1">{msg.author}</p>}
                  <p className="pb-3 pr-8 sm:pr-10">{msg.message}</p>
                  <span className="text-[9px] sm:text-[10px] text-gray-400 absolute bottom-1 right-2 uppercase">{msg.time}</span>
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>

          {/* Chat Input */}
          <div className="min-h-[64px] bg-[#f0f2f5] flex items-center px-2 sm:px-4 gap-2 sm:gap-4 pb-safe">
            <input className="flex-1 bg-white p-2 sm:p-3 rounded-lg outline-none text-sm" placeholder={`Message ${activeRoom}...`} value={currentMessage} onChange={(e) => setCurrentMessage(e.target.value)} onKeyPress={(e) => e.key === "Enter" && sendMessage()} />
            <button className="text-xl sm:text-2xl text-gray-500 hover:text-[#00a884] p-2" onClick={sendMessage}>➤</button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;