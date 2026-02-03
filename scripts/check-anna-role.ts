// ✅ Script to Check Anna's Role in Firebase Firestore
import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDRyGT6vYZHI5KCLBYHpjXE-aKX8Q0xE5g",
  authDomain: "meerak-b43ac.firebaseapp.com",
  projectId: "meerak-b43ac",
  storageBucket: "meerak-b43ac.firebasestorage.app",
  messagingSenderId: "295626373516",
  appId: "1:295626373516:web:25f40e5ee2f7ca99a53b6e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkAnnaRole() {
  try {
    console.log("🔍 Searching for Anna (phone: 0800000001)...");
    
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("phone", "==", "0800000001"));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log("❌ Anna not found in Firestore!");
      return;
    }
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log("\n✅ Found Anna:");
      console.log("📄 Document ID:", doc.id);
      console.log("👤 Name:", data.name);
      console.log("📧 Email:", data.email);
      console.log("📱 Phone:", data.phone);
      console.log("🎭 Role:", data.role);
      console.log("💰 Wallet:", data.wallet_balance);
      console.log("📊 Full Data:", data);
      
      if (data.role !== 'PROVIDER') {
        console.log("\n⚠️ WARNING: Anna's role is NOT 'PROVIDER'!");
        console.log("Expected: 'PROVIDER' (uppercase)");
        console.log("Got:", data.role);
      } else {
        console.log("\n✅ Anna's role is correct: PROVIDER");
      }
    });
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkAnnaRole();
