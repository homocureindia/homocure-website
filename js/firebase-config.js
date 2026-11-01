/* ===========================================================
   FIREBASE CONFIG — apni keys yahan paste karni hain
   Firebase Console → Project settings → Your apps → Web app
   (Setup steps README-SETUP.md mein hain)
=========================================================== */
window.HOMOCURE_FIREBASE = {
    apiKey:            "PASTE_API_KEY",
    authDomain:        "PASTE_PROJECT_ID.firebaseapp.com",
    projectId:         "PASTE_PROJECT_ID",
    storageBucket:     "PASTE_PROJECT_ID.appspot.com",
    messagingSenderId: "PASTE_SENDER_ID",
    appId:             "PASTE_APP_ID"
};

/* UI-ONLY flag: sirf buttons ka text/behaviour badalta hai ("Coming Soon" vs "Order Now").
   Yeh SECURITY control NAHI hai — koi bhi browser mein ise badal sakta hai.
   Asli switch database mein hai: Firestore doc config/public → ordersOpen (boolean).
   Jab tak woh true na ho (aur security review na ho), Firestore rules har order reject karti hain.
   Is flag ko false hi rakhein. */
window.HOMOCURE_ORDERS_OPEN = false;
