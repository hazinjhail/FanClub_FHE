import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface FanClubData {
  id: string;
  name: string;
  encryptedValue: any;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
  memberLevel: string;
  badge: string;
}

interface UserHistory {
  action: string;
  timestamp: number;
  data: string;
  status: string;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [fanClubs, setFanClubs] = useState<FanClubData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingClub, setCreatingClub] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newClubData, setNewClubData] = useState({ name: "", tokenAmount: "", description: "", memberLevel: "Bronze" });
  const [selectedClub, setSelectedClub] = useState<FanClubData | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [userHistory, setUserHistory] = useState<UserHistory[]>([]);
  const [stats, setStats] = useState({ total: 0, verified: 0, averageTokens: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  const memberLevels = {
    "Bronze": { min: 100, badge: "🥉", color: "#CD7F32" },
    "Silver": { min: 500, badge: "🥈", color: "#C0C0C0" },
    "Gold": { min: 1000, badge: "🥇", color: "#FFD700" },
    "Platinum": { min: 5000, badge: "💎", color: "#E5E4E2" }
  };

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const clubsList: FanClubData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          clubsList.push({
            id: businessId,
            name: businessData.name,
            encryptedValue: null,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0,
            memberLevel: getMemberLevel(Number(businessData.decryptedValue) || 0),
            badge: getBadge(Number(businessData.decryptedValue) || 0)
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setFanClubs(clubsList);
      updateStats(clubsList);
      if (address) loadUserHistory(clubsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const getMemberLevel = (tokens: number) => {
    if (tokens >= 5000) return "Platinum";
    if (tokens >= 1000) return "Gold";
    if (tokens >= 500) return "Silver";
    return "Bronze";
  };

  const getBadge = (tokens: number) => {
    if (tokens >= 5000) return "💎";
    if (tokens >= 1000) return "🥇";
    if (tokens >= 500) return "🥈";
    return "🥉";
  };

  const updateStats = (clubs: FanClubData[]) => {
    const total = clubs.length;
    const verified = clubs.filter(c => c.isVerified).length;
    const avgTokens = clubs.length > 0 ? clubs.reduce((sum, c) => sum + (c.decryptedValue || 0), 0) / clubs.length : 0;
    
    setStats({ total, verified, averageTokens: Math.round(avgTokens) });
  };

  const loadUserHistory = (clubs: FanClubData[]) => {
    if (!address) return;
    
    const userActions: UserHistory[] = [];
    clubs.forEach(club => {
      if (club.creator.toLowerCase() === address.toLowerCase()) {
        userActions.push({
          action: "Created Fan Club",
          timestamp: club.timestamp,
          data: club.name,
          status: club.isVerified ? "Verified" : "Pending"
        });
      }
    });
    
    setUserHistory(userActions.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10));
  };

  const createFanClub = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingClub(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating fan club with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const tokenValue = parseInt(newClubData.tokenAmount) || 0;
      const businessId = `fanclub-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, tokenValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newClubData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        Object.keys(memberLevels).indexOf(newClubData.memberLevel),
        0,
        newClubData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Fan club created successfully!" });
      addUserHistory("Created Fan Club", newClubData.name, "Pending");
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewClubData({ name: "", tokenAmount: "", description: "", memberLevel: "Bronze" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingClub(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      addUserHistory("Verified Tokens", businessId, "Verified");
      
      setTransactionStatus({ visible: true, status: "success", message: "Tokens verified successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const callIsAvailable = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const result = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available and working!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Contract call failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const addUserHistory = (action: string, data: string, status: string) => {
    const newHistory: UserHistory = {
      action,
      timestamp: Math.floor(Date.now() / 1000),
      data,
      status
    };
    
    setUserHistory(prev => [newHistory, ...prev.slice(0, 9)]);
  };

  const filteredClubs = fanClubs.filter(club => {
    const matchesSearch = club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         club.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || 
                         (filterStatus === "verified" && club.isVerified) ||
                         (filterStatus === "pending" && !club.isVerified);
    return matchesSearch && matchesFilter;
  });

  const renderStats = () => {
    return (
      <div className="stats-grid">
        <div className="stat-card neon-purple">
          <h3>Total Clubs</h3>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-trend">FHE Protected</div>
        </div>
        
        <div className="stat-card neon-blue">
          <h3>Verified Members</h3>
          <div className="stat-value">{stats.verified}/{stats.total}</div>
          <div className="stat-trend">On-chain Verified</div>
        </div>
        
        <div className="stat-card neon-pink">
          <h3>Avg Tokens</h3>
          <div className="stat-value">{stats.averageTokens}</div>
          <div className="stat-trend">FHE Encrypted</div>
        </div>
      </div>
    );
  };

  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">🔐</div>
          <div className="step-content">
            <h4>Token Encryption</h4>
            <p>Fan token balance encrypted with Zama FHE</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">📊</div>
          <div className="step-content">
            <h4>Threshold Check</h4>
            <p>Verify membership level without revealing amount</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">🎯</div>
          <div className="step-content">
            <h4>Access Content</h4>
            <p>Get exclusive fan content based on membership</p>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Private Fan Club 🔐</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🌟</div>
            <h2>Join Your Private Fan Club</h2>
            <p>Connect your wallet to access exclusive fan content with FHE-protected privacy</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Encrypt your fan token balance privately</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Access exclusive content without exposing holdings</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Privacy System...</p>
        <p className="loading-note">Securing your fan data with encryption</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading fan club system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Private Fan Club 🌟</h1>
          <span className="tagline">FHE-Protected Fan Experience</span>
        </div>
        
        <div className="header-actions">
          <button onClick={callIsAvailable} className="test-btn">
            Test Contract
          </button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            + New Fan Club
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="dashboard-section">
          <h2>Fan Club Dashboard</h2>
          {renderStats()}
          
          <div className="fhe-explainer">
            <h3>How FHE Protects Your Privacy</h3>
            {renderFHEFlow()}
          </div>
        </div>
        
        <div className="content-section">
          <div className="section-header">
            <h2>Fan Clubs</h2>
            <div className="controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search clubs..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Clubs</option>
                <option value="verified">Verified</option>
                <option value="pending">Pending</option>
              </select>
              <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
                {isRefreshing ? "🔄" : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="clubs-grid">
            {filteredClubs.length === 0 ? (
              <div className="no-clubs">
                <p>No fan clubs found</p>
                <button onClick={() => setShowCreateModal(true)} className="create-btn">
                  Create First Club
                </button>
              </div>
            ) : (
              filteredClubs.map((club, index) => (
                <div 
                  className={`club-card ${club.isVerified ? 'verified' : 'pending'}`}
                  key={index}
                  onClick={() => setSelectedClub(club)}
                >
                  <div className="club-header">
                    <span className="club-badge">{club.badge}</span>
                    <h3>{club.name}</h3>
                  </div>
                  <p className="club-desc">{club.description}</p>
                  <div className="club-meta">
                    <span>Level: {club.memberLevel}</span>
                    <span>Created: {new Date(club.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                  <div className={`club-status ${club.isVerified ? 'verified' : 'pending'}`}>
                    {club.isVerified ? `✅ ${club.decryptedValue} tokens` : '🔒 Encrypted'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {userHistory.length > 0 && (
          <div className="history-section">
            <h3>Your Activity</h3>
            <div className="history-list">
              {userHistory.map((item, index) => (
                <div className="history-item" key={index}>
                  <span className="action">{item.action}</span>
                  <span className="data">{item.data}</span>
                  <span className={`status ${item.status.toLowerCase()}`}>{item.status}</span>
                  <span className="time">{new Date(item.timestamp * 1000).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {showCreateModal && (
        <ModalCreateClub 
          onSubmit={createFanClub} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingClub} 
          clubData={newClubData} 
          setClubData={setNewClubData}
          isEncrypting={isEncrypting}
          memberLevels={memberLevels}
        />
      )}
      
      {selectedClub && (
        <ClubDetailModal 
          club={selectedClub} 
          onClose={() => setSelectedClub(null)} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedClub.id)}
          memberLevels={memberLevels}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateClub: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  clubData: any;
  setClubData: (data: any) => void;
  isEncrypting: boolean;
  memberLevels: any;
}> = ({ onSubmit, onClose, creating, clubData, setClubData, isEncrypting, memberLevels }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'tokenAmount') {
      const intValue = value.replace(/[^\d]/g, '');
      setClubData({ ...clubData, [name]: intValue });
    } else {
      setClubData({ ...clubData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-club-modal">
        <div className="modal-header">
          <h2>Create New Fan Club</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE Privacy Protection</strong>
            <p>Your token amount will be encrypted - only you can decrypt it</p>
          </div>
          
          <div className="form-group">
            <label>Club Name *</label>
            <input 
              type="text" 
              name="name" 
              value={clubData.name} 
              onChange={handleChange} 
              placeholder="Enter club name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Fan Tokens (Integer only) *</label>
            <input 
              type="number" 
              name="tokenAmount" 
              value={clubData.tokenAmount} 
              onChange={handleChange} 
              placeholder="Enter token amount..." 
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Target Member Level</label>
            <select name="memberLevel" value={clubData.memberLevel} onChange={handleChange}>
              {Object.entries(memberLevels).map(([level, info]: [string, any]) => (
                <option key={level} value={level}>
                  {level} {info.badge} (Min: {info.min} tokens)
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description" 
              value={clubData.description} 
              onChange={handleChange} 
              placeholder="Describe your fan club..." 
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !clubData.name || !clubData.tokenAmount} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting and Creating..." : "Create Fan Club"}
          </button>
        </div>
      </div>
    </div>
  );
};

const ClubDetailModal: React.FC<{
  club: FanClubData;
  onClose: () => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
  memberLevels: any;
}> = ({ club, onClose, isDecrypting, decryptData, memberLevels }) => {
  const [localDecrypted, setLocalDecrypted] = useState<number | null>(null);

  const handleDecrypt = async () => {
    if (club.isVerified || localDecrypted !== null) {
      const result = await decryptData();
      if (result !== null) {
        setLocalDecrypted(result);
      }
      return;
    }
    
    const result = await decryptData();
    if (result !== null) {
      setLocalDecrypted(result);
    }
  };

  const getAccessLevel = () => {
    const tokens = club.isVerified ? club.decryptedValue : (localDecrypted || 0);
    if (tokens >= 5000) return "Platinum";
    if (tokens >= 1000) return "Gold";
    if (tokens >= 500) return "Silver";
    return "Bronze";
  };

  return (
    <div className="modal-overlay">
      <div className="club-detail-modal">
        <div className="modal-header">
          <h2>{club.name}</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="club-info">
            <div className="info-item">
              <span>Creator:</span>
              <strong>{club.creator.substring(0, 6)}...{club.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Created:</span>
              <strong>{new Date(club.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Description:</span>
              <strong>{club.description}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Token Data</h3>
            
            <div className="data-row">
              <div className="data-label">Your Tokens:</div>
              <div className="data-value">
                {club.isVerified ? 
                  `${club.decryptedValue} (On-chain Verified)` : 
                  localDecrypted !== null ? 
                  `${localDecrypted} (Locally Decrypted)` : 
                  "🔒 FHE Encrypted"
                }
              </div>
              <button 
                className={`decrypt-btn ${(club.isVerified || localDecrypted !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "🔓 Verifying..." :
                 club.isVerified ? "✅ Verified" :
                 localDecrypted !== null ? "🔄 Re-verify" : "🔓 Verify Tokens"}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE Privacy Protection</strong>
                <p>Your token balance is encrypted on-chain. Verify to reveal your membership level while keeping the exact amount private.</p>
              </div>
            </div>
          </div>
          
          {(club.isVerified || localDecrypted !== null) && (
            <div className="access-section">
              <h3>Your Exclusive Access</h3>
              <div className="access-level">
                <span className="level-badge">{getAccessLevel()} {memberLevels[getAccessLevel()]?.badge}</span>
                <span className="level-desc">Minimum {memberLevels[getAccessLevel()]?.min} tokens required</span>
              </div>
              
              <div className="exclusive-content">
                <h4>Unlocked Content:</h4>
                <ul>
                  <li>🎵 Exclusive music tracks</li>
                  <li>📸 Behind-the-scenes photos</li>
                  <li>🎥 Private video content</li>
                  <li>🎫 Priority event access</li>
                </ul>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!club.isVerified && (
            <button onClick={handleDecrypt} disabled={isDecrypting} className="verify-btn">
              {isDecrypting ? "Verifying..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;


