// server.js
// where your node app starts

// init project
var express = require('express');
var app = express();
var pug = require("pug");
var bparser = require("body-parser");
var session = require("express-session");
var mClient = require("mongodb").MongoClient;
var bcrypt = require("bcrypt");
var ObjectId = require("mongodb").ObjectId;
var req = require("request");

//env variables
var mongo_url = process.env.MONGO_URL
var api_key = process.env.API_KEY

//middleware
app.use(bparser.urlencoded({ extended: false }));
//initialize express-session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
}))

// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));

//use pug as templating engine
app.set("view engine","pug");

//variables for frontend
app.use((request, response, next) => {
    response.locals.currentUser = request.session.userId;
    next();
});



//------------------------- get routes --------------------------


//homepage
app.get("/", function (request, response) {
  response.render("search");
});

app.get("/signup",function(request,response) {
  response.render("signup")
});

app.get("/login",function(request,response) {
  response.render("login")
});
//---------------------------------------------------------------



//------------------------ post routes --------------------------

//login logic handling
app.post("/login",function(request,response) {
  mClient.connect(mongo_url,function(error,database) {
    if(error)throw error;
    //check for username in database
    database.collection("user-data").find({username: request.body.user}).toArray(function(error,data) {
      if(error)throw error;
      //if user not found throw error
      if(data[0] == "") {
        return response.render("login",{error: "user does not exist"});
      }
      else {
        //compare the hash of input password vs db hash
        bcrypt.compare(request.body.pass,data[0].password,function(error,res) {
          if(res) {
            request.session.userId = data[0]._id;
            response.redirect("/");
          }
          else {
            response.render("login",{error: "passwords do not match"})
          }
        })
      }
    })
  })
});

//creating users from signup form
app.post("/signup",function(request,response) {

  //set up user data object
  var user_data = {
    username: request.body.user,
    email: request.body.email,
  };
  
  bcrypt.hash(request.body.pass1,10,function(error,hash) {
    if(error)throw error;
    else {
      user_data.password = hash;
    }
  })
  
  if(request.body.pass1 != request.body.pass2) {
    return response.render("signup",{error: "passwords do not match"})
  }
  
  //check for empty fields
  var val_arr = Object.values(request.body)
  for(var i =0; i<val_arr.length;i++) {
    val_arr[i] = val_arr[i].trim()
  }
  if(val_arr.indexOf("") != -1) {
    return response.render("signup",{error: "fields cannot be empty"})
  }
  
  //check if user or email already exists, if not push user data to server
  mClient.connect(mongo_url,function(error,database) {
    if(error)throw error;
    //check if username exists, if not ,check if email exists,if not , create account
    database.collection("user-data").find({username: request.body.user}).toArray(function(error,data) {
      if(error)throw error;
      
      if(data == "") {
        database.collection("user-data").find({email: request.body.email}).toArray(function(error,data) {
          if(data == "") {
            database.collection("user-data").insertOne(user_data);
            response.redirect("login")
          }
          else {
            err = new Error("Email is already in use");
            return response.render("signup",{error: err.message});
          }
        })
        
      }
      else {
        var err = new Error("User already exists");
        return response.render("signup",{error: err.message});
      }
      
    })
  })
  
  
})

//post route for searching
app.post("/search",function(request,response) {
  var location = request.body.location
  
  var options = {
    url: "https://api.yelp.com/v3/businesses/search?location=" + location + "&limit=10&categories=bars",
    headers: {
      Authorization: "Bearer " + api_key
    }
  }

  //pull going data from database
  mClient.connect(mongo_url,function(error,database) {
    if(error)throw error;
    database.collection("going").find({}).toArray(function(error,data) {
      //instantiate going object which is passed to frontend to render how many people are going to each bar
      var going_arr = {}
      for(var i = 0; i < data.length; i++) {
        going_arr[data[i].bar_name] = data[i].count.length
      }
      
      //use request package to make yelp api call
      req(options,function(error,res,body) {
        if(error)throw error
        var results = JSON.parse(body);
        //push the recent search to the collection to save it in case the user logs in
        database.collection("recent-search").update({_id: ObjectId("5a33a827734d1d293238474e")},{bar_arr: results.businesses,going_arr: going_arr})
        //render search page with results from yelp api and going data from database
        response.render("search",{bar_arr: results.businesses,going_arr: going_arr})
      })
    })
  })
})

app.post("/click-going",function(request,response) {
  var bar_name = request.body.bar_name;
  
  mClient.connect(mongo_url,function(error,database) {
    if(error)throw error;
    database.collection("going").find({bar_name: bar_name}).toArray(function(error,data) {
      if(error)throw error;
      //if the bar name doesnt exist create a new document with the bar name and with the users session Id in the count array
      if(data == "") {
        database.collection("going").insertOne({bar_name: bar_name,count: [request.session.userId]})
      }
      //else check if the user is already in the count array to see if they are already going
      else {
        //if not add them to the array
        if(data[0].count.indexOf(request.session.userId) == -1) {
          database.collection("going").update({"bar_name": bar_name},{$push: {count: request.session.userId}})
        }
        //if so, remove them from the going array
        else {
          database.collection("going").update({"bar_name": bar_name},{$pull: {count: request.session.userId}})
        }
      }
    })
  })
})
//---------------------------------------------------------------


// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
