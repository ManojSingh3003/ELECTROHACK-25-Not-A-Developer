import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    orderBy, 
    doc, 
    updateDoc, 
    getDoc,
    arrayUnion,
    arrayRemove, 
    deleteDoc,
    where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentUser = null;
let currentUserData = null;

// -----------------------------
// Auth state & load user data
// -----------------------------
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;

        try {
            if (typeof window.getUserData === 'function') {
                currentUserData = await window.getUserData(user.uid);
            } else {
                currentUserData = (await window.getUserData?.(user.uid)) || null;
            }
        } catch (err) {
            console.warn('Could not load user data via getUserData():', err);
            currentUserData = null;
        }

        // ✅ UPDATED: Check for currentUserData AND currentUserData.name
        if (currentUserData && currentUserData.name) {
            document.getElementById('userName').textContent = currentUserData.name;
        } else {
            document.getElementById('userName').textContent = "User";
        }

        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('date');
        if (dateInput) {
            dateInput.setAttribute('min', today);
            dateInput.value = today;
        }

        loadFoodOrders();
        setInterval(loadFoodOrders, 5000);
    } else {
        window.location.href = 'index.html';
    }
});

// -----------------------------
// Submit new food order
// -----------------------------
const foodForm = document.getElementById('foodForm');
if (foodForm) {
    foodForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) {
            alert('Please login to share an order');
            return;
        }

        const restaurant = document.getElementById('restaurant').value.trim();
        const items = document.getElementById('items').value.trim();
        const deliveryTime = document.getElementById('deliveryTime').value;
        const date = document.getElementById('date').value;
        const location = document.getElementById('location').value.trim();
        const maxPeople = document.getElementById('maxPeople').value ? parseInt(document.getElementById('maxPeople').value) : null;
        const deliveryCharge = parseFloat(document.getElementById('deliveryCharge').value || 0);
        const notes = document.getElementById('notes').value.trim();

        try {
            const orderDateTime = new Date(date + 'T' + deliveryTime);
            if (orderDateTime < new Date()) {
                alert('Please select a future date and time for your order!');
                return;
            }

            await addDoc(collection(db, 'food'), {
                userId: currentUser.uid,
                userName: currentUserData?.name || "User",
                userVerified: currentUserData?.verified || false,

                restaurant: restaurant,
                // structured items list (owner entry)
                itemsList: [
                    {
                        userId: currentUser.uid,
                        userName: currentUserData?.name || "User",
                        list: items,
                        userVerified: currentUserData?.verified || false
                    }
                ],

                deliveryTime: deliveryTime,
                date: date,
                location: location,
                maxPeople: maxPeople,
                deliveryCharge: deliveryCharge,
                notes: notes || '',
                joinedUsers: [],
                createdAt: new Date().toISOString()
            });

            document.getElementById('foodForm').reset();
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('date').value = today;

            alert('Order shared successfully! \n\nYour order is now visible to others.');

            setTimeout(() => loadFoodOrders(), 500);
        } catch (error) {
            alert('Failed to share order!\n\n' + (error.message || 'Unknown error'));
        }
    });
}

// -----------------------------
// Render helper: items table
// -----------------------------
function renderItemsTable(order) {
    const itemsList = Array.isArray(order.itemsList) ? order.itemsList : (order.items ? [{ userId: order.userId, userName: order.userName || 'User', list: order.items, userVerified: order.userVerified || false }] : []);

    if (!itemsList || itemsList.length === 0) return `<div class="text-sm text-gray-600 italic">No items listed</div>`;

    let rows = itemsList.map(entry => {
        const verifiedTick = entry.userVerified ? `<span class="text-blue-500 ml-1" title="Verified User"><i class="fas fa-check-circle text-xs"></i></span>` : '';
        const safeName = String(entry.userName || 'User').replace(/</g, '&lt;');
        const safeList = String(entry.list || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
        return `
            <tr class="border-b last:border-b-0 hover:bg-orange-50">
                <td class="px-3 py-2 text-sm font-medium text-gray-800 flex items-center">${safeName} ${verifiedTick}</td>
                <td class="px-3 py-2 text-sm text-gray-700">${safeList}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="mt-3 overflow-x-auto">
            <table class="min-w-full bg-white rounded-lg shadow-sm overflow-hidden border border-orange-200">
                <thead class="bg-orange-100 text-orange-800">
                    <tr>
                        <th class="text-left px-3 py-2 text-sm font-semibold w-1/3">User</th>
                        <th class="text-left px-3 py-2 text-sm font-semibold w-2/3">Items</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}


// -----------------------------
// Load and display food orders
// -----------------------------
async function loadFoodOrders() {
    try {
        const foodFeed = document.getElementById('foodFeed');
        if (!foodFeed) {
            return;
        }

        const foodQuery = query(collection(db, 'food'), orderBy('createdAt', 'desc'));
        const foodSnapshot = await getDocs(foodQuery);

        let hasFutureOrders = false;
        foodFeed.innerHTML = '';

        if (foodSnapshot.empty) {
            foodFeed.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-pizza-slice text-gray-300 text-6xl mb-4"></i>
                    <p class="text-gray-500 font-medium">No orders available yet. Be the first to share!</p>
                </div>
            `;
            return;
        }

        foodSnapshot.docs.forEach((docSnap) => {
            const order = docSnap.data();
            const orderId = docSnap.id;

            const orderDateTime = new Date(order.date + 'T' + order.deliveryTime);
            if (orderDateTime < new Date()) return; // skip past

            hasFutureOrders = true;

            const isOwner = order.userId === currentUser?.uid;
            const hasJoined = order.joinedUsers && order.joinedUsers.some(u => u.userId === currentUser?.uid);
            const canJoin = !isOwner && !hasJoined && (!order.maxPeople || (order.joinedUsers ? order.joinedUsers.length : 0) < (order.maxPeople - 1));

            const joinedCount = order.joinedUsers ? order.joinedUsers.length : 0;
            const totalPeople = joinedCount + 1; // Owner + Joined
            const chargePerPerson = (order.deliveryCharge && totalPeople > 0) ? (order.deliveryCharge / totalPeople).toFixed(2) : '0.00';
            const spotsLeft = order.maxPeople ? (order.maxPeople - totalPeople) : null;

            const orderCard = document.createElement('div');
            orderCard.className = 'bg-white p-5 rounded-2xl border-2 border-soft-coral/30 shadow-md animate-slide-in';

            orderCard.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center">
                        <span class="font-bold text-deep-slate">${order.userName}</span>
                        ${order.userVerified ? '<i class="fas fa-check-circle text-blue-500 text-xs ml-1" title="Verified User"></i>' : ''}
                    </div>
                    <span class="text-xs text-gray-500">${formatDateTime(order.date, order.deliveryTime)}</span>
                </div>

                <div class="mb-3">
                    <p class="text-lg font-semibold text-soft-coral mb-1">
                        <i class="fas fa-store mr-1"></i>${order.restaurant}
                    </p>
                    <p class="text-sm text-gray-600 mt-2 mb-2">
                        <i class="fas fa-map-marker-alt text-gray-500 mr-1"></i>${order.location}
                    </p>
                    <div class="text-sm text-gray-600">
                        ${renderItemsTable(order)}
                    </div>
                </div>

                <div class="flex flex-wrap gap-2 mb-4 text-sm">
                    <span class="bg-green-100 text-green-800 px-3 py-1 rounded-full font-semibold">
                        <i class="fas fa-rupee-sign mr-1 text-xs"></i>${chargePerPerson} / person
                    </span>
                    <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-semibold">
                        <i class="fas fa-user-friends mr-1"></i> ${totalPeople} ${totalPeople > 1 ? 'people' : 'person'}
                    </span>
                    ${spotsLeft !== null ? `
                        <span class="bg-orange-100 text-orange-800 px-3 py-1 rounded-full font-semibold">
                            <i class="fas fa-users mr-1"></i>${spotsLeft} ${spotsLeft > 1 ? 'spots' : 'spot'} left
                        </span>
                    ` : ''}
                </div>

                ${order.notes ? `<p class="text-sm text-gray-600 mb-4 p-2 bg-gray-100 rounded-lg"><i class="fas fa-comment text-gray-400 mr-1"></i> ${order.notes}</p>` : ''}

                ${isOwner ? 
                    (order.joinedUsers && order.joinedUsers.length > 0 ? `
                        <button onclick="leaveFoodOrderOwner('${orderId}')" 
                            class="w-full bg-gradient-to-r from-orange-500 to-orange-700 text-white py-3 px-4 rounded-xl hover:from-orange-600 transition-all duration-200 font-bold shadow-lg">
                            <i class="fas fa-sign-out-alt mr-2"></i> Leave Order (Promote Host)
                        </button>
                    ` : `
                        <button onclick="deleteFoodOrder('${orderId}')" 
                            class="w-full bg-gradient-to-r from-red-500 to-red-700 text-white py-3 px-4 rounded-xl hover:from-red-600 transition-all duration-200 font-bold shadow-lg">
                            <i class="fas fa-trash-alt mr-2"></i> Delete Empty Order
                        </button>
                    `)
                : hasJoined ? `
                    <button onclick="leaveFoodOrderPassenger('${orderId}')"
                        class="w-full bg-gradient-to-r from-gray-500 to-gray-600 text-white py-3 px-4 rounded-xl hover:from-gray-600 transition-all duration-200 font-bold shadow-lg">
                        <i class="fas fa-sign-out-alt mr-2"></i> Leave Order
                    </button>
                ` : canJoin ? `
                    <button onclick="joinFoodOrder('${orderId}')"
                        class="w-full bg-gradient-to-r from-orange-600 to-pink-600 text-white py-3 px-4 rounded-xl hover:from-orange-700 hover:to-pink-700 transform hover:scale-105 transition-all duration-200 font-bold shadow-lg">
                        <i class="fas fa-hand-paper mr-2"></i> Join Order
                    </button>
                ` : `
                    <button class="w-full bg-gradient-to-r from-gray-400 to-gray-500 text-white py-3 px-4 rounded-xl cursor-not-allowed font-semibold shadow-md" disabled>
                        <i class="fas fa-times-circle mr-2"></i> ${order.maxPeople ? 'Full' : 'Cannot Join'}
                    </button>
                `}
            `;

            foodFeed.appendChild(orderCard);
        });

        if (!hasFutureOrders && !foodSnapshot.empty) {
            foodFeed.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-pizza-slice text-gray-300 text-6xl mb-4"></i>
                    <p class="text-gray-500 font-medium mb-2">No upcoming orders available.</p>
                    <p class="text-gray-400 text-sm">All orders have passed. Create a new order!</p>
                </div>
            `;
        } else if (foodFeed.children.length === 0 && !foodSnapshot.empty) {
            foodFeed.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-pizza-slice text-gray-300 text-6xl mb-4"></i>
                    <p class="text-gray-500 font-medium">No orders available yet. Be the first to share!</p>
                </div>
            `;
        }
    } catch (error) {
        const foodFeed = document.getElementById('foodFeed');
        if (foodFeed) {
            foodFeed.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-exclamation-circle text-red-500 text-6xl mb-4"></i>
                    <p class="text-red-600 font-semibold mb-2">Error loading orders</p>
                    <p class="text-gray-600 text-sm">${error.message || 'Unknown error occurred'}</p>
                </div>
            `;
        }
    }
}


// -----------------------------
// JOIN ORDER (merge/delete logic)
// -----------------------------
window.joinFoodOrder = async function(orderId) {
    if (!currentUser) {
        alert('Please login to join an order');
        return;
    }

    const items = prompt("What items would you like to add to this order?");
    if (!items) { 
        alert("Join cancelled. No items were added.");
        return;
    }

    try {
        const orderRef = doc(db, 'food', orderId);
        const orderDoc = await getDoc(orderRef);

        if (!orderDoc.exists()) {
            alert('Order not found');
            return;
        }

        const targetOrder = orderDoc.data();

        if (targetOrder.joinedUsers && targetOrder.joinedUsers.some(u => u.userId === currentUser.uid)) {
            alert('You have already joined this order');
            return;
        }

        if (targetOrder.maxPeople) {
            const joinedCountT = targetOrder.joinedUsers ? targetOrder.joinedUsers.length : 0;
            if (joinedCountT >= targetOrder.maxPeople - 1) {
                alert('Maximum people reached for this order');
                return;
            }
        }

        const myOrderQuery = query(collection(db, 'food'), where('userId', '==', currentUser.uid));
        const myOrderSnap = await getDocs(myOrderQuery);

        let myOrderDoc = null;
        myOrderSnap.forEach(d => {
            if (d.id !== orderId) {
                myOrderDoc = { id: d.id, data: d.data() };
            }
        });

        const myItemsEntry = {
            userId: currentUser.uid,
            userName: currentUserData?.name || 'User',
            userVerified: currentUserData?.verified || false,
            list: items 
        };

        if (myOrderDoc) {
            const myOrder = myOrderDoc.data;

            if (myOrder.restaurant && myOrder.restaurant.toLowerCase().trim() === targetOrder.restaurant.toLowerCase().trim()) {
                const confirmMerge = confirm(
                    `You already created an order from the same restaurant (${myOrder.restaurant}).\n` +
                    `Joining will combine your items with the selected order and delete your previous order.\n\n` +
                    `Do you want to continue?`
                );
                if (!confirmMerge) return;

                await updateDoc(orderRef, {
                    itemsList: arrayUnion(myItemsEntry),
                    joinedUsers: arrayUnion({
                        userId: currentUser.uid,
                        userName: currentUserData?.name || 'User',
                        userVerified: currentUserData?.verified || false
                    })
                });

                await deleteDoc(doc(db, 'food', myOrderDoc.id));

                alert('Your items have been merged into the selected order!');
                loadFoodOrders();
                return;
            } else {
                const confirmDelete = confirm(
                    `You already created an order at "${myOrder.restaurant}".\n` +
                    `If you join this order, your previous order will be deleted.\n\nDo you want to continue?`
                );
                if (!confirmDelete) return;
                await deleteDoc(doc(db, 'food', myOrderDoc.id));
            }
        }

        await updateDoc(orderRef, {
            itemsList: arrayUnion(myItemsEntry),
            joinedUsers: arrayUnion({
                userId: currentUser.uid,
                userName: currentUserData?.name || 'User',
                userVerified: currentUserData?.verified || false
            })
        });

        alert(`Successfully joined!`);
        loadFoodOrders();
    } catch (error) {
        alert('Failed to join order. Please try again. ' + (error.message || ''));
    }
};

// LEAVE A FOOD ORDER (AS PASSENGER)
window.leaveFoodOrderPassenger = async function (orderId) {
    if (!currentUser || !currentUserData) {
        alert("Please login.");
        return;
    }

    if (!confirm("Are you sure you want to leave this food order?")) {
        return;
    }

    try {
        const orderRef = doc(db, "food", orderId);
        const orderSnap = await getDoc(orderRef);

        if (!orderSnap.exists()) {
            alert("Error: Order not found.");
            loadFoodOrders();
            return;
        }

        const order = orderSnap.data();
        
        // Find the user in joinedUsers
        const userToRemove = order.joinedUsers.find(u => u.userId === currentUser.uid);
        // Find the user's items in itemsList
        const itemsToRemove = order.itemsList.find(i => i.userId === currentUser.uid);

        if (!userToRemove) {
            alert("Error: You were not found in this order's user list.");
            return;
        }

        const updates = {
            joinedUsers: arrayRemove(userToRemove)
        };

        // Also remove their items
        if (itemsToRemove) {
            updates.itemsList = arrayRemove(itemsToRemove);
        }

        await updateDoc(orderRef, updates);

        alert("You have successfully left the food order.");
        loadFoodOrders(); // Refresh the feed

    } catch (error) {
        alert("Error leaving order: " + error.message);
    }
};

// LEAVE A FOOD ORDER (AS OWNER - PROMOTES NEW HOST)
window.leaveFoodOrderOwner = async function (orderId) {
    if (!currentUser || !currentUserData) {
        alert("Please login.");
        return;
    }

    if (!confirm("Are you sure you want to leave? The first user who joined will be promoted to the new host.")) {
        return;
    }

    try {
        const orderRef = doc(db, "food", orderId);
        const orderSnap = await getDoc(orderRef);

        if (!orderSnap.exists()) {
            alert("Error: Order not found.");
            loadFoodOrders();
            return;
        }

        const order = orderSnap.data();

        // Safety checks
        if (order.userId !== currentUser.uid) {
            alert("Error: You are not the owner.");
            return;
        }
        if (!order.joinedUsers || order.joinedUsers.length === 0) {
            alert("Error: This order is empty. You should delete it, not leave it.");
            return;
        }

        // Promote the first passenger
        const newOwner = order.joinedUsers[0];
        // Find the leaving owner's items to remove them
        const ownerItemsToRemove = order.itemsList.find(i => i.userId === currentUser.uid);

        const updates = {
            userId: newOwner.userId,
            userName: newOwner.userName,
            userVerified: newOwner.userVerified,
            
            // Remove the new owner from the passenger list
            joinedUsers: arrayRemove(newOwner)
        };
        
        // Remove the old owner's items from the list
        if (ownerItemsToRemove) {
            updates.itemsList = arrayRemove(ownerItemsToRemove);
        }

        await updateDoc(orderRef, updates);

        alert(`You have left the order. ${newOwner.userName} is the new host!`);
        loadFoodOrders();

    } catch (error) {
        alert("Error: " + error.message);
    }
};

// DELETE FOOD ORDER (OWNER ONLY - WHEN EMPTY)
window.deleteFoodOrder = async function (orderId) {
    if (!currentUser) {
        alert("Please login.");
        return;
    }

    if (!confirm("Are you sure you want to PERMANENTLY delete your food order? This cannot be undone.")) {
        return;
    }

    try {
        const orderRef = doc(db, "food", orderId);
        const orderSnap = await getDoc(orderRef);

        if (orderSnap.exists()) {
            const order = orderSnap.data();
            // Check: user is owner AND no one has joined
            if (order.userId === currentUser.uid && (!order.joinedUsers || order.joinedUsers.length === 0)) {
                await deleteDoc(orderRef);
                alert("Your food order has been deleted.");
                loadFoodOrders(); 
            } else if (order.userId !== currentUser.uid) {
                alert("Error: You are not the owner.");
            } else {
                alert("Error: You cannot delete an order that has other users. You must 'Leave' it.");
            }
        } else {
            alert("Error: Order not found.");
        }
    } catch (error) {
        alert("Error deleting order: " + error.message);
    }
};

// -----------------------------
// Date/time formatting helper
// -----------------------------
function formatDateTime(date, time) {
    const dateObj = new Date(date + 'T' + time);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let dateStr = '';
    if (dateObj.toDateString() === today.toDateString()) {
        dateStr = 'Today';
    } else if (dateObj.toDateString() === tomorrow.toDateString()) {
        dateStr = 'Tomorrow';
    } else {
        dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${dateStr} at ${timeStr}`;
}
