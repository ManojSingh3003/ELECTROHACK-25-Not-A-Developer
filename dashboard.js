import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Check authentication
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    // Load Firestore user profile using global function from auth.js
    const userData = await window.getUserData(user.uid);

    // ✅ UPDATED: Check for userData AND userData.name
    if (userData && userData.name) {
        document.getElementById('userGreeting').textContent = `Hi, ${userData.name} 👋`;
    } else {
        document.getElementById('userGreeting').textContent = "Hi, User 👋";
    }

    loadStats();
});

// Load dashboard statistics
async function loadStats() {
    try {
        // Count active future rides
        const ridesSnapshot = await getDocs(collection(db, 'rides'));
        const activeRides = ridesSnapshot.docs.filter((docSnap) => {
            const ride = docSnap.data();
            const rideDate = new Date(ride.date + 'T' + ride.time);
            return rideDate >= new Date();
        }).length;

        // Count active food orders
        const foodSnapshot = await getDocs(collection(db, 'food'));
        const activeFood = foodSnapshot.docs.filter((docSnap) => {
            const order = docSnap.data();
            const orderDate = new Date(order.date + 'T' + order.deliveryTime);
            return orderDate >= new Date();
        }).length;

        // Count number of users
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const totalUsers = usersSnapshot.size;

        // Update UI
        document.getElementById('totalRides').textContent = activeRides;
        document.getElementById('totalFood').textContent = activeFood;
        document.getElementById('totalUsers').textContent = totalUsers;

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Logout function (works with global logoutUser from auth.js)
window.logoutUser = async function () {
    try {
        await window.logoutUser();
    } catch (error) {
        console.error("Logout failed:", error);
    }
};
