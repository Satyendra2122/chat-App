import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const socket = io.connect('http://localhost:3001');

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(true); 
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  const [currentMessage, setCurrentMessage] = useState("");
  const [messageList, setMessageList] = useState({});
  const [activeRoom, setActiveRoom] = useState("General");
  
  // Database States
  const [rooms, setRooms] = useState([]); // Groups I am in
  const [managedGroups, setManagedGroups] = useState([]); // Groups I own
  const [searchResults, setSearchResults] = useState([]); // Global search
  const [searchTerm, setSearchTerm] = useState("");

  const scrollRef = useRef();

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messageList, activeRoom]);

  // Core Data Fetcher
  const fetchMyData = async (user) => {
    const response = await fetch(`http://localhost:3001/my-data`, {
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
      const response = await fetch(`http://localhost:3001/${endpoint}`, {
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

  // Create Group
  const addNewGroup = async () => {
    const newGroup = prompt("Enter new group name:");
    if (newGroup && newGroup.trim() !== "") {
      const res = await fetch("http://localhost:3001/create-group", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, groupName: newGroup }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        fetchMyData(username);
        setActiveRoom(newGroup);
      } else { alert(data.error); }
    }
  };

  // Leave Group
  const leaveGroup = async () => {
    if (activeRoom === "General") return alert("You cannot leave the General group!");
    if (!window.confirm(`Leave ${activeRoom}?`)) return;

    await fetch("http://localhost:3001/leave-group", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, groupName: activeRoom }),
    });
    
    fetchMyData(username);
    setActiveRoom("General");
  };

  // Global Search
  useEffect(() => {
    const searchDB = async () => {
      if (searchTerm.trim() === "") { setSearchResults([]); return; }
      const res = await fetch("http://localhost:3001/search-groups", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchTerm }),
      });
      const data = await res.json();
      if (data.status === "ok") setSearchResults(data.results);
    };
    const timeoutId = setTimeout(() => searchDB(), 300); // Debounce typing
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // Request Join
  const requestJoin = async (groupName) => {
    await fetch("http://localhost:3001/request-join", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, groupName }),
    });
    alert(`Request sent to join ${groupName}!`);
    setSearchTerm(""); // clear search
  };

  // Approve Join
  const approveUser = async (targetUser) => {
    await fetch("http://localhost:3001/approve-join", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupName: activeRoom, targetUser }),
    });
    alert(`${targetUser} approved!`);
    fetchMyData(username); // refresh managed lists
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
      <div className="h-screen bg-[#00a884] flex flex-col items-center justify-center">
        <div className="bg-white p-10 rounded-lg shadow-2xl w-[450px] text-center">
          <div className="text-6xl mb-4">💬</div><h1 className="text-2xl font-light text-gray-600 mb-6">WhatsApp Clone</h1>
          <h2 className="text-lg font-bold text-gray-800 mb-4">{isLoginMode ? "Secure Login" : "Create Account"}</h2>
          <input className="w-full border-b-2 border-whatsapp-green p-3 mb-4 outline-none text-center bg-gray-50" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="w-full border-b-2 border-whatsapp-green p-3 mb-8 outline-none text-center bg-gray-50" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyPress={(e) => e.key === "Enter" && handleAuth()} />
          <button className="w-full bg-[#00a884] text-white py-3 rounded font-medium mb-4" onClick={handleAuth}>{isLoginMode ? "LOGIN" : "REGISTER"}</button>
          <p className="text-sm text-gray-500 cursor-pointer" onClick={() => setIsLoginMode(!isLoginMode)}>{isLoginMode ? "Register here" : "Login here"}</p>
        </div>
      </div>
    );
  }

  const currentGroupManaged = managedGroups.find(g => g.name === activeRoom);

  return (
    <div className="h-screen w-screen bg-[#dadbd3] flex items-center justify-center overflow-hidden relative">
      <div className="absolute top-0 w-full h-32 bg-[#00a884] z-0"></div>
      <div className="flex w-full max-w-[1400px] h-[95vh] bg-[#f0f2f5] shadow-2xl z-10 rounded-none md:rounded-lg overflow-hidden">
        
        {/* SIDEBAR */}
        <div className="w-[400px] bg-white border-r flex flex-col">
          <div className="h-16 bg-[#f0f2f5] flex items-center justify-between px-4 border-b">
            <div className="w-10 h-10 bg-gray-400 rounded-full flex items-center justify-center text-white font-bold uppercase">{username[0]}</div>
            <div className="flex gap-4 items-center">
              <button onClick={fetchMyData} className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">🔄 Sync</button>
              <button onClick={handleLogout} className="text-xs font-bold text-red-600 bg-red-100 px-3 py-2 rounded">LOGOUT</button>
              <span className="cursor-pointer text-xl" title="Create Group" onClick={addNewGroup}>➕</span>
            </div>
          </div>
          
          <div className="p-2 border-b">
            <div className="bg-[#f0f2f5] flex items-center px-4 py-2 rounded-lg">
              <span className="mr-4">🔍</span>
              <input placeholder="Search global groups to join..." className="bg-transparent outline-none text-sm w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Show Search Results if typing */}
            {searchTerm.length > 0 ? (
              <div className="p-2">
                <p className="text-xs text-gray-500 font-bold mb-2 uppercase px-2">Global Search Results</p>
                {searchResults.map((g) => (
                  <div key={g.name} className="flex justify-between items-center p-3 border-b">
                    <span className="font-medium text-gray-800">{g.name}</span>
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
              // Show My Groups
              <div>
                <p className="text-xs text-gray-500 font-bold mb-2 mt-4 uppercase px-4">My Groups</p>
                {rooms.map((r) => (
                  <div key={r} onClick={() => setActiveRoom(r)} className={`flex items-center p-4 cursor-pointer hover:bg-[#f5f6f6] border-b ${activeRoom === r ? 'bg-[#ebebeb]' : ''}`}>
                    <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center text-blue-600 mr-4 font-bold uppercase">{r[0]}</div>
                    <span className="font-medium">{r}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* MAIN CHAT */}
        <div className="flex-1 flex flex-col bg-[#efeae2] relative" style={{backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')"}}>
          <div className="h-16 bg-[#f0f2f5] flex items-center px-4 border-b shadow-sm relative">
            <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-600 mr-4 font-bold uppercase">{activeRoom[0]}</div>
            <div className="flex-1 font-medium">{activeRoom}</div>
            
            {/* Admin Management Dropdown */}
            {currentGroupManaged && currentGroupManaged.pendingRequests.length > 0 && (
              <div className="bg-orange-100 text-orange-800 border border-orange-300 px-4 py-1 rounded text-sm font-bold flex items-center gap-4 shadow-sm absolute right-32">
                <span>🔔 {currentGroupManaged.pendingRequests.length} Pending</span>
                <div className="flex gap-2">
                  {currentGroupManaged.pendingRequests.map(user => (
                    <button key={user} onClick={() => approveUser(user)} className="bg-orange-500 text-white px-2 py-1 rounded text-xs">Approve {user}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Leave Group (Hide for General) */}
            {activeRoom !== "General" && (
              <button onClick={leaveGroup} className="text-xs bg-red-100 text-red-700 px-3 py-2 rounded font-bold ml-4">🚪 Leave</button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-2">
            {(messageList[activeRoom] || []).map((msg, i) => (
              <div key={i} className={`flex ${msg.author === username ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[65%] p-2 px-3 rounded-lg shadow-sm relative text-[14.2px] ${msg.author === username ? 'bg-[#dcf8c6] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                  {msg.author !== username && <p className="text-xs font-bold text-orange-600 mb-1">{msg.author}</p>}
                  <p className="pb-2 pr-8">{msg.message}</p>
                  <span className="text-[10px] text-gray-400 absolute bottom-1 right-2 uppercase">{msg.time}</span>
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>

          <div className="h-16 bg-[#f0f2f5] flex items-center px-4 gap-4">
            <input className="flex-1 bg-white p-3 rounded-lg outline-none text-sm" placeholder={`Message ${activeRoom}...`} value={currentMessage} onChange={(e) => setCurrentMessage(e.target.value)} onKeyPress={(e) => e.key === "Enter" && sendMessage()} />
            <button className="text-2xl text-gray-500 hover:text-[#00a884]" onClick={sendMessage}>➤</button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;