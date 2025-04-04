document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const orderList = document.getElementById('order-list');
    const ingredients = document.querySelectorAll('.ingredient');
    const appliances = document.querySelectorAll('.appliance');
    const preparedItemsContainer = document.getElementById('prepared-items');
    const scoreDisplay = document.getElementById('score');
    const messageArea = document.getElementById('message-area');
    const startButton = document.getElementById('start-button');

    // --- Game State ---
    let score = 0;
    let activeOrders = {};
    let orderIdCounter = 0;
    let gameInterval = null;
    let preparedItems = []; // Holds {id: string, name: string, element: HTMLElement}
    const MAX_ORDERS = 5;
    const ORDER_TIME_LIMIT = 30000; // 30 seconds in milliseconds
    const ORDER_INTERVAL = 5000; // Base interval check, actual generation is randomized

    // --- Food Definitions ---
    const foodItems = {
        'patty': { appliance: 'grill', result: 'cookedPatty' },
        'potatoes': { appliance: 'fryer', result: 'fries' },
        'cup': { appliance: 'drink-machine', result: 'drink' },
        'cookedPatty': { appliance: 'assembly-station', requires: 'bun', result: 'burger' }
        // 'bun' dropped on assembly is handled directly in processCooking
    };

    const possibleOrders = [
        { items: ['burger'] },
        { items: ['fries', 'drink'] },
        { items: ['burger', 'fries'] },
        { items: ['burger', 'fries', 'drink'] },
        { items: ['drink'] }
    ];

    // --- Drag and Drop Event Handlers ---
    let draggedItemElement = null;

    // (Drag handlers for ingredients - No changes needed here)
    ingredients.forEach(ingredient => {
        ingredient.addEventListener('dragstart', (e) => {
            draggedItemElement = ingredient;
            setTimeout(() => ingredient.classList.add('dragging'), 0);
            e.dataTransfer.setData('text/plain', ingredient.id);
        });
        ingredient.addEventListener('dragend', () => {
            if (draggedItemElement && draggedItemElement === ingredient) {
                 ingredient.classList.remove('dragging');
            }
            // Don't nullify globally here, might be a prepared item drag ending
        });
    });

    // (Drag handlers for prepared items - No changes needed here)
    function addPreparedDragHandlers(itemDiv) {
         itemDiv.addEventListener('dragstart', (e) => {
            draggedItemElement = itemDiv;
            setTimeout(() => itemDiv.classList.add('dragging'), 0);
            e.dataTransfer.setData('text/plain', itemDiv.id); // Pass unique prepared ID
        });
        itemDiv.addEventListener('dragend', () => {
             if (draggedItemElement && draggedItemElement === itemDiv) {
                itemDiv.classList.remove('dragging');
             }
             draggedItemElement = null; // Clear after any drag ends
        });
    }

    // (Appliance drop handlers - No changes needed here)
    appliances.forEach(appliance => {
        appliance.addEventListener('dragover', (e) => { e.preventDefault(); appliance.classList.add('drag-over'); });
        appliance.addEventListener('dragenter', (e) => { e.preventDefault(); appliance.classList.add('drag-over'); });
        appliance.addEventListener('dragleave', () => { appliance.classList.remove('drag-over'); });
        appliance.addEventListener('drop', (e) => {
            e.preventDefault();
            appliance.classList.remove('drag-over');
            const droppedItemIdFull = e.dataTransfer.getData('text/plain');
            const targetApplianceId = appliance.id;
            let baseItemId = droppedItemIdFull;
            let isPrepared = false;
            if (droppedItemIdFull.startsWith('prepared-')) {
                 isPrepared = true;
                 baseItemId = droppedItemIdFull.split('-')[1];
            }
            processCooking(baseItemId, targetApplianceId, droppedItemIdFull, isPrepared);
        });
    });

    // --- Game Logic Functions ---

    // (startGame, stopGame, generateOrder, displayOrder, updateTimer - No changes needed here)
    function startGame() {
        score = 0;
        orderIdCounter = 0;
        activeOrders = {};
        preparedItems = [];
        updateScore();
        clearOrders();
        clearPreparedItems();
        displayMessage("Game Started!", "success", 0); // Keep message until first action
        startButton.disabled = true;

        gameInterval = setInterval(() => {
            if (Object.keys(activeOrders).length < MAX_ORDERS) {
                 if (Math.random() < 0.2) { // ~ Roughly every 5 seconds
                     generateOrder();
                 }
            }
            // Update all active order timers
            Object.values(activeOrders).forEach(order => {
                 if (order && order.timerId) { // Check if order still exists
                      updateTimer(order);
                 }
            });
        }, 1000);

        setTimeout(generateOrder, 1500); // Generate first order slightly after start
    }

    function stopGame(message) {
        clearInterval(gameInterval);
        gameInterval = null;
        Object.values(activeOrders).forEach(order => {
            if (order && order.timerId) clearInterval(order.timerId);
        });
        displayMessage(message, "error", 0); // Keep game over message visible
        startButton.disabled = false;
    }

    function generateOrder() {
        if (Object.keys(activeOrders).length >= MAX_ORDERS) return;
        orderIdCounter++;
        const orderId = `order-${orderIdCounter}`;
        const randomOrderTemplate = possibleOrders[Math.floor(Math.random() * possibleOrders.length)];
        const newOrder = { id: orderId, items: [...randomOrderTemplate.items], neededItems: [...randomOrderTemplate.items], startTime: Date.now(), timeLimit: ORDER_TIME_LIMIT, timerId: null, element: null };
        activeOrders[orderId] = newOrder;
        displayOrder(newOrder);
    }

    function displayOrder(order) {
        const orderDiv = document.createElement('div');
        orderDiv.classList.add('order');
        orderDiv.id = order.id;
        const title = document.createElement('p');
        title.textContent = `Order #${order.id.split('-')[1]}`;
        orderDiv.appendChild(title);
        const itemList = document.createElement('ul');
        order.items.forEach(item => {
            const li = document.createElement('li');
            // Add icon based on item name (example) - JS needs this logic
            let icon = '';
            if (item === 'burger') icon = '🍔';
            else if (item === 'fries') icon = '🍟';
            else if (item === 'drink') icon = '🥤';
            li.innerHTML = `<span class="icon">${icon}</span> ${item.charAt(0).toUpperCase() + item.slice(1)}`; // Add icon dynamically
            li.dataset.item = item;
            itemList.appendChild(li);
        });
        orderDiv.appendChild(itemList);
        const timerContainer = document.createElement('div');
        timerContainer.classList.add('timer-bar-container');
        const timerBar = document.createElement('div');
        timerBar.classList.add('timer-bar');
        timerContainer.appendChild(timerBar);
        orderDiv.appendChild(timerContainer);
        order.element = orderDiv;
        orderList.appendChild(orderDiv);
        // Start visual timer update more frequently for smoothness
        order.timerId = setInterval(() => updateTimer(order), 100);
    }

    function updateTimer(order) {
        // Ensure order hasn't been removed concurrently
        if (!activeOrders[order.id]) {
             if(order.timerId) clearInterval(order.timerId);
             return;
        }

        const now = Date.now();
        const timeElapsed = now - order.startTime;
        const timeRemaining = order.timeLimit - timeElapsed;

        if (timeRemaining <= 0) {
            displayMessage(`Order #${order.id.split('-')[1]} missed!`, "error");
            removeOrder(order.id); // This also clears the interval
            // Potential game over logic could go here
            // Example: if (score < 0) stopGame("Too many missed orders!");
        } else {
            const timerBar = order.element?.querySelector('.timer-bar');
            if (timerBar) {
                const percentage = Math.max(0, (timeRemaining / order.timeLimit) * 100); // Ensure not negative
                timerBar.style.width = `${percentage}%`;
                // Update color based on percentage
                if (percentage < 25) timerBar.style.backgroundColor = '#f44336'; // Red
                else if (percentage < 50) timerBar.style.backgroundColor = '#ff9800'; // Orange
                else timerBar.style.backgroundColor = '#4CAF50'; // Green
            }
        }
    }

    // (processCooking - No changes needed, consumption logic is here)
    function processCooking(baseItemId, applianceId, originalDroppedId, isPrepared) {
        const recipe = foodItems[baseItemId];

        // Handle dropping BUN onto ASSEMBLY station specifically
        if (baseItemId === 'bun' && applianceId === 'assembly-station') {
             displayMessage('Bun ready for assembly.', 'info', 1500);
             addPreparedItem('bun'); // Add bun to prepared area (will be non-draggable, won't auto-remove)
             return; // Stop further processing for bun drop
         }

        // Handle items with defined cooking/assembly steps
        if (recipe && recipe.appliance === applianceId) {
            // Check for required items (like bun for burger)
            if (recipe.requires) {
                 const requiredItemName = recipe.requires;
                 // Find the first available required item in the prepared list
                 const availableRequiredItem = preparedItems.find(pItem => pItem.name === requiredItemName);

                 if (!availableRequiredItem) {
                     displayMessage(`Need ${requiredItemName} for ${baseItemId}!`, "error", 2000);
                     return; // Stop: requirement not met
                 }
                 // Requirement met! Consume the required item by removing it
                 removePreparedItem(availableRequiredItem.id); // Consume the bun (or other required item)
            }

             // If we reach here, cooking/assembly is successful
            const resultItem = recipe.result;
            displayMessage(`${resultItem.charAt(0).toUpperCase() + resultItem.slice(1)} ready!`, "success", 1500);

            // If the item dropped was a prepared item (like cookedPatty), remove its original instance now
             if (isPrepared) {
                 removePreparedItem(originalDroppedId);
             }

            // Add the final product (e.g., burger), which WILL auto-clear
            addPreparedItem(resultItem);
            checkOrdersForCompletion(resultItem); // Check if the *result* completes an order
        } else {
             // Dropped item doesn't have a valid recipe OR it was bun on assembly (already handled)
             if (baseItemId !== 'bun') { // Avoid double message for bun drop
                 displayMessage(`Cannot use ${baseItemId} on ${applianceId}!`, "error", 1500);
             }
        }
    }

    // *** REVISED addPreparedItem Function ***
    function addPreparedItem(itemName) {
        const preparedId = `prepared-${itemName}-${Date.now()}`;
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('item', 'prepared-item'); // Add base 'item' class too
        itemDiv.id = preparedId;

        // Add icon - needs more robust logic for different items
        let icon = '';
        if (itemName === 'cookedPatty') icon = '🍳';
        else if (itemName === 'fries') icon = '🍟';
        else if (itemName === 'drink') icon = '🥤';
        else if (itemName === 'bun') icon = '🍞';
        else if (itemName === 'burger') icon = '🍔';
        itemDiv.innerHTML = `<span class="icon">${icon}</span> ${itemName.charAt(0).toUpperCase() + itemName.slice(1)}`;

        let isDraggable = false;
        // Only make 'cookedPatty' draggable from the prepared area
        if (itemName === 'cookedPatty') {
             isDraggable = true;
             itemDiv.draggable = true;
             itemDiv.style.cursor = 'grab'; // Explicitly set cursor
             addPreparedDragHandlers(itemDiv);
        } else {
            itemDiv.draggable = false;
             itemDiv.style.cursor = 'default';
        }

        preparedItemsContainer.appendChild(itemDiv);
        preparedItems.push({ id: preparedId, name: itemName, element: itemDiv });

        // --- MODIFIED AUTO-REMOVAL LOGIC ---
        // Auto-remove non-draggable FINAL products after a short delay
        // DO NOT auto-remove 'bun' as it needs to wait for assembly
        if (!isDraggable && itemName !== 'bun') {
             setTimeout(() => {
                 // Check if the item still exists in the DOM before removing
                 // It might have been consumed (like a required item) or removed by other means
                 const elementExists = document.getElementById(preparedId);
                 if(elementExists) {
                      removePreparedItem(preparedId);
                      // console.log(`Auto-removed visual for ${preparedId}`);
                 }
             }, 2500); // Remove visual for fries, drink, burger after 2.5s
        }
        // --- END MODIFICATION ---
    }

    // (removePreparedItem - No changes needed here)
    function removePreparedItem(preparedId) {
        const itemIndex = preparedItems.findIndex(item => item.id === preparedId);
        if (itemIndex > -1) {
             const itemToRemove = preparedItems[itemIndex];
             if(itemToRemove.element) {
                  itemToRemove.element.remove(); // Remove from DOM
             }
             preparedItems.splice(itemIndex, 1); // Remove from state array
             // console.log(`Removed prepared item from state: ${preparedId}`);
        } else {
            // Attempt to remove from DOM just in case state is inconsistent
             const fallbackElement = document.getElementById(preparedId);
             if(fallbackElement) fallbackElement.remove();
        }
    }

    // (checkOrdersForCompletion, serveOrder, removeOrder - No changes needed here)
     function checkOrdersForCompletion(preparedItemName) {
        // console.log(`Checking orders for completion of: ${preparedItemName}`);
        for (const orderId in activeOrders) {
            // Ensure order still exists before processing
            if (!activeOrders[orderId]) continue;

            const order = activeOrders[orderId];
            const itemIndex = order.neededItems.indexOf(preparedItemName);

            if (itemIndex > -1) {
                // This order needs the item!
                order.neededItems.splice(itemIndex, 1);

                // Mark the item as completed in the UI
                const listItem = order.element?.querySelector(`li[data-item="${preparedItemName}"]`);
                if (listItem && !listItem.classList.contains('completed')) {
                    listItem.classList.add('completed');
                }

                // Check if the order is now complete
                if (order.neededItems.length === 0) {
                    serveOrder(orderId);
                    // Important: Don't break here if one item could fulfill multiple orders (unlikely in this setup, but good practice)
                    // However, for this game, breaking is fine as one prepared item likely fulfills only one needed slot.
                    break;
                }
                 // If the item fulfilled part of an order but didn't complete it,
                 // and the item is a final product (non-draggable like fries/drink),
                 // its visual removal is handled by the timeout in addPreparedItem.
            }
        }
    }

    function serveOrder(orderId) {
        const order = activeOrders[orderId];
        if (!order) return; // Already served or removed
        score += order.items.length * 10; // Score based on number of items
        updateScore();
        displayMessage(`Order #${order.id.split('-')[1]} Served! +${order.items.length * 10} pts`, "success", 2500);
        removeOrder(orderId); // Clean up the completed order
    }

     function removeOrder(orderId) {
        const order = activeOrders[orderId];
        if (order) {
            if (order.timerId) {
                 clearInterval(order.timerId); // Stop timer updates specifically for this order
                 order.timerId = null; // Clear the timerId property
            }
            order.element?.remove(); // Remove from DOM using optional chaining
            delete activeOrders[orderId]; // Remove from active list
            // console.log(`Removed Order: ${orderId}`);
        }
    }


    // --- UI Update Functions ---
    // (updateScore, displayMessage, clearOrders, clearPreparedItems - No major changes needed)
     function updateScore() {
        scoreDisplay.textContent = score;
        // Optional: Add visual feedback for score change?
    }

    function displayMessage(msg, type = "info", duration = 3000) {
        messageArea.textContent = msg;
        messageArea.className = 'message-area'; // Reset classes
        if (type === 'success') messageArea.classList.add('message-success');
        else if (type === 'error') messageArea.classList.add('message-error');
        else if (type === 'info') messageArea.classList.add('message-info'); // Add class for info

         // Clear message after duration, unless duration is 0 or less
         if (duration > 0) {
             // Clear previous timeouts for this element if any, to prevent overlaps
             if (messageArea.timeoutId) clearTimeout(messageArea.timeoutId);

             messageArea.timeoutId = setTimeout(() => {
                 // Only clear if the current message is still the one we set
                 if (messageArea.textContent === msg) {
                     messageArea.textContent = '';
                     messageArea.className = 'message-area'; // Reset styles
                 }
                 messageArea.timeoutId = null; // Clear the stored timeout ID
             }, duration);
         } else {
              // If duration is 0 or less, clear any existing timeout immediately
               if (messageArea.timeoutId) {
                    clearTimeout(messageArea.timeoutId);
                    messageArea.timeoutId = null;
               }
         }
    }

    function clearOrders() {
         // Also clear any remaining timer intervals when clearing all orders (e.g., on game restart)
          Object.values(activeOrders).forEach(order => {
             if (order && order.timerId) {
                  clearInterval(order.timerId);
                  order.timerId = null;
             }
          });
        orderList.innerHTML = '';
        activeOrders = {}; // Reset active orders state
    }

    function clearPreparedItems() {
        preparedItemsContainer.innerHTML = '';
        preparedItems = []; // Reset prepared items state
    }

    // --- Event Listeners ---
    startButton.addEventListener('click', startGame);

    // --- Initial Setup ---
    displayMessage("Click 'Start Game' to begin!", "info", 0); // Use info style, don't auto-clear

}); // End DOMContentLoaded