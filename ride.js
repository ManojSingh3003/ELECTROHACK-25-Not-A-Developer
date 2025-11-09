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
    deleteDoc, 
    where,
    arrayUnion,
    arrayRemove  
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentUser = null;
let currentUserData = null;

// AUTH CHECK + LOAD USER DATA
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        currentUserData = await window.getUserData(user.uid);

        if (!currentUserData) {
            console.warn("Retrying user data load...");
            currentUserData = await window.getUserData(user.uid);
        }

        // ✅ UPDATED: Check for currentUserData AND currentUserData.name
        if (currentUserData && currentUserData.name) {
            document.getElementById('userName').textContent = currentUserData.name;
        } else {
            document.getElementById('userName').textContent = "User";
        }

        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('date');
        dateInput.setAttribute('min', today);
        dateInput.value = today;

        loadRides();
        setInterval(loadRides, 10000); 
    } else {
        window.location.href = 'index.html';
    }
});


// HANDLE RIDE SUBMISSION
document.getElementById('rideForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) {
        alert("Please login to share a ride");
        return;
    }

    const source = document.getElementById('source').value;
    const destination = document.getElementById('destination').value;
    const time = document.getElementById('time').value;
    const date = document.getElementById('date').value;
    const seats = parseInt(document.getElementById('seats').value);
    const cost = parseFloat(document.getElementById('cost').value);
    const notes = document.getElementById('notes').value;

    try {
        const rideDateTime = new Date(date + "T" + time);
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        if (rideDateTime < oneHourAgo) {
            alert("Please select a future date & time!");
            return;
        }

        const userName = currentUserData?.name || "User";
        const userVerified = currentUserData?.verified || false;

        await addDoc(collection(db, "rides"), {
            userId: currentUser.uid,
            userName: userName,
            userVerified: userVerified,
            source,
            destination,
            time,
            date,
            seats, 
            availableSeats: seats, 
            cost, 
            notes: notes || "",
            joinedUsers: [], 
            createdAt: new Date().toISOString(),
        });

        document.getElementById("rideForm").reset();
        document.getElementById("date").value = new Date().toISOString().split("T")[0];
        alert("Ride shared successfully");
        setTimeout(loadRides, 500); 
    } catch (error) {
        alert("Failed to share ride: " + error.message);
    }
});


// LOAD RIDES ON PAGE
async function loadRides() {
    try {
        const ridesFeed = document.getElementById("ridesFeed");
        const newFeedHTML = []; 

        const ridesQuery = query(collection(db, "rides"), orderBy("createdAt", "desc"));
        const ridesSnapshot = await getDocs(ridesQuery);

        let rideCount = 0;
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        ridesSnapshot.forEach((docSnap) => {
            const ride = docSnap.data();
            const rideId = docSnap.id;

            const rideDateTime = new Date(ride.date + "T" + ride.time);
            if (rideDateTime < oneHourAgo) return;

            rideCount++;

            const isOwner = ride.userId === currentUser?.uid;
            const hasJoined = ride.joinedUsers?.some(u => u.userId === currentUser?.uid);
            const canJoin = !isOwner && !hasJoined && ride.availableSeats > 0;

            // --- 1. PASSENGER LIST HTML ---
            let passengersHTML = '';
            if ((isOwner || hasJoined) && ride.joinedUsers && ride.joinedUsers.length > 0) {
                passengersHTML = `
                    <div class="mt-4 pt-3 border-t border-dusty-blue/30">
                        <h4 class="font-semibold text-sm text-deep-slate mb-2">
                            <i class="fas fa-user-check text-green-600 mr-1"></i> Passengers Joined (${ride.joinedUsers.length}):
                        </h4>
                        <ul class="list-disc list-inside pl-2 space-y-1">
                            ${ride.joinedUsers.map(user => 
                                `<li class="text-sm text-gray-700">
                                    ${user.userName}
                                    ${user.userVerified ? '<i class="fas fa-check-circle text-blue-500 text-xs ml-1" title="Verified User"></i>' : ''}
                                </li>`
                            ).join('')}
                        </ul>
                    </div>
                `;
            }

            const costPerPerson = (ride.seats > 0) ? (ride.cost / ride.seats).toFixed(0) : ride.cost;

            // --- 2. NEW BUTTON LOGIC (Host Promotion) ---
            let buttonHTML = '';
            if (isOwner) {
                if (ride.joinedUsers && ride.joinedUsers.length > 0) {
                    // Owner, but people have joined. Show "Leave (Promote)"
                    buttonHTML = `<button onclick="leaveRideOwner('${rideId}')" 
                                    class="w-full mt-4 py-2 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-orange-700 hover:from-orange-600 transition-all duration-200">
                                    <i class="fas fa-sign-out-alt mr-1"></i> Leave Ride (Promote Host)
                                  </button>`;
                } else {
                    // Owner, and NO one has joined. Show "Delete"
                    buttonHTML = `<button onclick="deleteRide('${rideId}')" 
                                    class="w-full mt-4 py-2 rounded-xl font-bold text-white bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 transition-all duration-200">
                                    <i class="fas fa-trash-alt mr-1"></i> Delete Empty Ride
                                  </button>`;
                }
            } else if (hasJoined) {
                // Passenger, not owner. Show regular "Leave Ride"
                buttonHTML = `<button onclick="leaveRidePassenger('${rideId}')" 
                                class="w-full mt-4 py-2 rounded-xl font-bold text-gray-700 bg-gray-200 hover:bg-gray-300 transition-all duration-200">
                                <i class="fas fa-sign-out-alt mr-1"></i> Leave Ride
                              </button>`;
            } else if (canJoin) {
                // Not in ride, can join.
                buttonHTML = `<button onclick="joinRide('${rideId}')" 
                                class="w-full mt-4 py-2 rounded-xl font-bold text-white bg-gradient-to-r from-dusty-blue to-blue-600 hover:from-blue-600 transition-all duration-200">
                                <i class="fas fa-user-plus mr-1"></i> Join Ride
                              </button>`;
            } else { 
                // Full
                buttonHTML = `<button class="w-full mt-4 py-2 rounded-xl font-bold text-white bg-gray-400 cursor-not-allowed" disabled>
                                <i class="fas fa-times-circle mr-1"></i> Ride Full
                              </button>`;
            }
            // --- END NEW BUTTON LOGIC ---

            // --- 3. Updated Card HTML ---
            const cardHTML = `
                <div class="bg-white p-5 rounded-2xl border-2 border-dusty-blue/30 shadow-md animate-slide-in">
                    <div class="flex justify-between items-center">
                        <span class="font-bold text-deep-slate flex items-center">
                            ${ride.userName}
                            ${ride.userVerified ? '<i class="fas fa-check-circle text-blue-500 text-xs ml-1" title="Verified User"></i>' : ''}
                        </span>
                        <span class="text-xs text-gray-500">${formatDateTime(ride.date, ride.time)}</span>
                    </div>

                    <p class="mt-2 text-lg font-semibold text-dusty-blue">
                        <i class="fas fa-map-marker-alt text-red-500 mr-1"></i> ${ride.source}
                        <i class="fas fa-arrow-right text-sm mx-1 text-gray-400"></i>
                        <i class="fas fa-map-marker-alt text-green-500 mr-1"></i> ${ride.destination}
                    </p>

                    <div class="flex justify-between items-center mt-3 text-sm">
                        <span class="font-medium text-gray-700">
                            <i class="fas fa-users text-dusty-blue mr-1"></i>
                            ${ride.availableSeats} / ${ride.seats} Seats Left
                        </span>
                        <span class="font-bold text-lg text-green-600">
                            <i class="fas fa-rupee-sign text-xs"></i>
                            ${costPerPerson}
                            <span class="text-xs text-gray-500 font-medium">/ person</span>
                        </span>
                    </div>
                    
                    ${ride.notes ? `<p class="text-sm text-gray-600 mt-2 p-2 bg-gray-100 rounded-lg"><i class="fas fa-comment text-gray-400 mr-1"></i> ${ride.notes}</p>` : ''}

                    ${buttonHTML}

                    ${passengersHTML}
                </div>
            `;
            newFeedHTML.push(cardHTML);
        });

        if (rideCount === 0) {
            ridesFeed.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-car text-gray-300 text-6xl mb-4"></i>
                    <p class="text-gray-500 font-medium">No rides available yet. Be the first to share!</p>
                </div>`;
        } else {
            ridesFeed.innerHTML = newFeedHTML.join('');
        }
    } catch (err) {
        ridesFeed.innerHTML = `<p class="text-center text-red-500">Error loading rides.</p>`;
    }
}


// JOIN A RIDE
window.joinRide = async function (rideId) {
    try {
        if (!currentUser || !currentUserData) {
            alert("Please login to join a ride.");
            return;
        }

        const myRideQuery = query(collection(db, "rides"), where("userId", "==", currentUser.uid));
        const myRideSnap = await getDocs(myRideQuery);
        let myExistingRideId = null;

        myRideSnap.forEach((docSnap) => {
            if (docSnap.id !== rideId) myExistingRideId = docSnap.id; 
        });

        if (myExistingRideId) {
            const confirmDelete = confirm("You already created a ride.\n\nIf you join another ride, YOUR created ride will be deleted.\n\nDo you want to continue?");
            if (!confirmDelete) return; 
            await deleteDoc(doc(db, "rides", myExistingRideId));
        }

        const rideRef = doc(db, "rides", rideId);
        const rideSnap = await getDoc(rideRef);

        if (!rideSnap.exists()) {
            alert("Ride not found.");
            loadRides(); 
            return;
        }

        const ride = rideSnap.data();
        if (ride.availableSeats <= 0) {
            alert("Sorry, this ride is now full.");
            loadRides(); 
            return;
        }

        await updateDoc(rideRef, {
            availableSeats: ride.availableSeats - 1,
            joinedUsers: arrayUnion({
                userId: currentUser.uid,
                userName: currentUserData?.name || "User",
                userVerified: currentUserData?.verified || false
            }),
        });

        alert("Successfully joined the ride!");
        loadRides(); 
    } catch (error) {
        alert("Error joining ride: " + error.message);
    }
};


// LEAVE A RIDE (AS PASSENGER)
window.leaveRidePassenger = async function (rideId) {
    if (!currentUser || !currentUserData) {
        alert("Please login.");
        return;
    }

    if (!confirm("Are you sure you want to leave this ride?")) {
        return;
    }

    try {
        const rideRef = doc(db, "rides", rideId);
        const rideSnap = await getDoc(rideRef);

        if (!rideSnap.exists()) {
            alert("Error: Ride not found.");
            loadRides();
            return;
        }

        const ride = rideSnap.data();
        
        // Find the user in the array to remove them
        const userToRemove = ride.joinedUsers.find(u => u.userId === currentUser.uid);

        if (!userToRemove) {
            alert("Error: You were not found in this ride's passenger list.");
            return;
        }

        await updateDoc(rideRef, {
            availableSeats: ride.availableSeats + 1, // Add the seat back
            joinedUsers: arrayRemove(userToRemove)  // Remove user from array
        });

        alert("You have successfully left the ride.");
        loadRides();

    } catch (error) {
        alert("Error leaving ride: " + error.message);
    }
};

// LEAVE A RIDE (AS OWNER - PROMOTES NEW HOST)
window.leaveRideOwner = async function (rideId) {
    if (!currentUser || !currentUserData) {
        alert("Please login.");
        return;
    }

    if (!confirm("Are you sure you want to leave? The first passenger will be promoted to the new host.")) {
        return;
    }

    try {
        const rideRef = doc(db, "rides", rideId);
        const rideSnap = await getDoc(rideRef);

        if (!rideSnap.exists()) {
            alert("Error: Ride not found.");
            loadRides();
            return;
        }

        const ride = rideSnap.data();

        // Safety checks
        if (ride.userId !== currentUser.uid) {
            alert("Error: You are not the owner.");
            return;
        }
        if (!ride.joinedUsers || ride.joinedUsers.length === 0) {
            alert("Error: This ride is empty. You should delete it, not leave it.");
            return;
        }

        // Promote the first passenger
        const newOwner = ride.joinedUsers[0]; 

        await updateDoc(rideRef, {
            userId: newOwner.userId,
            userName: newOwner.userName,
            userVerified: newOwner.userVerified,
            
            // Remove the new owner from the passenger list
            joinedUsers: arrayRemove(newOwner),
            
            // The new owner is no longer a "passenger", so a seat is freed up
            availableSeats: ride.availableSeats + 1 
        });

        alert(`You have left the ride. ${newOwner.userName} is the new host!`);
        loadRides();

    } catch (error) {
        alert("Error: " + error.message);
    }
};

// DELETE RIDE (OWNER ONLY - WHEN EMPTY)
window.deleteRide = async function (rideId) {
    if (!currentUser) {
        alert("Please login.");
        return;
    }
    
    if (!confirm("Are you sure you want to PERMANENTLY delete your ride? This cannot be undone.")) {
        return;
    }

    try {
        const rideRef = doc(db, "rides", rideId);
        const rideSnap = await getDoc(rideRef);

        if (rideSnap.exists()) {
            const ride = rideSnap.data();
            // Check: user is owner AND no one has joined
            if (ride.userId === currentUser.uid && (!ride.joinedUsers || ride.joinedUsers.length === 0)) {
                await deleteDoc(rideRef);
                alert("Your ride has been deleted.");
                loadRides(); 
            } else if (ride.userId !== currentUser.uid) {
                alert("Error: You are not the owner.");
            } else {
                alert("Error: You cannot delete a ride that has passengers. You must 'Leave' it.");
            }
        } else {
            alert("Error: Ride not found.");
        }
    } catch (error) {
        alert("Error deleting ride: " + error.message);
    }
};


// FORMAT DATE-TIME
function formatDateTime(date, time) {
    try {
        const d = new Date(date + "T" + time);
        if (isNaN(d.getTime())) return `${date} at ${time}`;
        return d.toLocaleString("en-US", {
            hour: "2-digit", minute: "2-digit", month: "short", day: "numeric"
        });
    } catch (e) {
        return `${date} at ${time}`;
    }
}
