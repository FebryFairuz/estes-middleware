require("dotenv").config();
const packageJSON = require("./package.json");
const express = require('express');
const cors = require("cors");
const app = express();

const port = process.env.API_PORT;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});

//import an api routes file
const jaguarRoute = require("./routers/jaguarRoute.js");
//end import


//ROUTE BASE
app.get('/', (req, res) => {
    res.render('index', { title: 'SGU Estes Middleware', version: packageJSON.version });
});

app.use("/app/api", jaguarRoute);

//END ROUTE
