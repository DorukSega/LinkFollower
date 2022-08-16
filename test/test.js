/*
This is a test program that will host a API Endpoint at 127.168.1.1:5000
So the tester can modify the text.txt and trigger differences
*/
const express = require('express');
const app = express();
const fs = require("fs");

app.get('/', function (req, res) {
    fs.readFile(__dirname + "/" + "test.txt", 'utf8', function (err, data) {
        res.end(data);
    });
})

const server = app.listen(5000, function () {
    console.log("Example app listening at http://127.168.1.1:5000")
})