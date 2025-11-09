import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection,
    doc,
    setDoc,
    getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// --- User Authentication Functions ---
// Handles registering a brand new user with email and password
window.registerUser = async function(name, email, password) {
    try {
        // First, create the user account in Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Next, create a matching profile document in our Firestore database
        await setDoc(doc(db, "users", user.uid), {
            name: name, // Storing the user's display name
            email: email,
            verified: false, // Default status: set to 'true' manually for special users
            createdAt: new Date().toISOString() // Tracking when the profile was created
        });


        return { success: true, user: user };
    } catch (error) {
        // Convert the technical Firebase error code into a friendly message
        throw new Error(getErrorMessage(error.code));
    }
};

// Handles logging an existing user in
window.loginUser = async function(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        // Convert the technical Firebase error code into a friendly message
        throw new Error(getErrorMessage(error.code));
    }
};

// Handles logging the current user out
window.logoutUser = async function() {
    try {
        await signOut(auth);
        return { success: true };
    } catch (error) {
        throw new Error('Logout failed: ' + error.message);
    }
};

// A quick way to get the currently signed-in user object
window.getCurrentUser = function() {
    return auth.currentUser;
};

// Sets up a listener to react whenever the user's sign-in state changes (login/logout)
window.onAuthStateChanged = function(callback) {
    return onAuthStateChanged(auth, callback);
};

// --- User Data Management Functions ---

// Fetches a user's custom profile data from the Firestore database
window.getUserData = async function(uid) {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
            // Return the profile data if the document exists
            return userDoc.data();
        } else {
            // No profile found for this user ID
            return null;
        }
    } catch (error) {
        console.error('Error getting user data:', error);
        return null;
    }
};

// --- Utility Functions ---

// Converts Firebase error codes (like 'auth/weak-password') into easy-to-read messages for the user
function getErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/email-already-in-use':
            return 'This email is already registered. Please login instead.';
        case 'auth/invalid-email':
            return 'Invalid email address.';
        case 'auth/weak-password':
            return 'Password is too weak. Please use at least 6 characters.';
        case 'auth/user-not-found':
            return 'No account found with this email.';
        case 'auth/wrong-password':
            return 'Incorrect password.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your internet connection.';
        default:
            return 'Authentication failed: ' + errorCode;
    }
}

// A guard function that ensures the user is logged in before continuing; redirects to 'index.html' otherwise
window.requireAuth = function() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // User is authenticated, allow access
                resolve(user);
            } else {
                // User is NOT logged in, redirect them to the home/login page
                window.location.href = 'index.html';
                reject('User not authenticated');
            }
        });
    });
};