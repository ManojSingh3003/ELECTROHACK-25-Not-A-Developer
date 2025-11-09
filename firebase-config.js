

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyDK3J3lcty2bsSF7pMrffgxZEO8R3oaaRw",
    authDomain: "wheel2gether-fb5e8.firebaseapp.com",
    projectId: "wheel2gether-fb5e8",
    storageBucket: "wheel2gether-fb5e8.firebasestorage.app",
    messagingSenderId: "521816599557",
    appId: "1:521816599557:web:343227d952e0dc711d006c",
    measurementId: "G-S2CV1BXNDZ"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export for use in other files
export { auth, db };

