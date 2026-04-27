import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCkVZUFfFoTLYKIaCGYh9OaI0sXQMcjNL0",
  authDomain:        "john-s3ade.firebaseapp.com",
  databaseURL:       "https://john-s3ade-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "john-s3ade",
  storageBucket:     "john-s3ade.firebasestorage.app",
  messagingSenderId: "653876904517",
  appId:             "1:653876904517:web:0976ec8136f9edc8e1d92c",
  measurementId:     "G-HLG66Z7V7B"
};

const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch(() => {});

export default app;
