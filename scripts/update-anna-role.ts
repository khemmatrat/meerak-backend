/**
 * Script to update Anna's role to PROVIDER in Firebase
 * Run this once to fix existing user data
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDRyGT6vYZHI5KCLBYHpjXE-aKX8Q0xE5g",
  authDomain: "meerak-b43ac.firebaseapp.com",
  projectId: "meerak-b43ac",
  storageBucket: "meerak-b43ac.firebasestorage.app",
  messagingSenderId: "724073604621",
  appId: "1:724073604621:web:ba7a15d6c7de7e6f5e8e5e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function updateAnnaRole() {
  try {
    console.log('🔍 Searching for Anna (phone: 0800000001)...');
    
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('phone', '==', '0800000001'));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('❌ Anna not found in database');
      return;
    }
    
    const annaDoc = snapshot.docs[0];
    const annaData = annaDoc.data();
    
    console.log('✅ Found Anna:', {
      id: annaDoc.id,
      name: annaData.name,
      currentRole: annaData.role,
      phone: annaData.phone
    });
    
    console.log('🔄 Updating role to PROVIDER...');
    
    await updateDoc(doc(db, 'users', annaDoc.id), {
      role: 'PROVIDER',
      name: 'Anna Provider',
      updated_at: new Date().toISOString()
    });
    
    console.log('✅ Successfully updated Anna to PROVIDER!');
    console.log('👉 Please logout and login again as Anna');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

updateAnnaRole();
