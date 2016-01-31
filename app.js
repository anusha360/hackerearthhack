var WebSocketServer = require("ws").Server;
var gcm = require('node-gcm');
var express = require('express');
var http = require('http');
var https = require('https');
var bodyParser = require('body-parser');
var Firebase = require("firebase");
var app = express();
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));

var port = process.env.PORT || 5000;
var gcmKey = 'AIzaSyCEEkwC2sW4SZfl2cjPfaJS3Cl5hvsYNew';
// Set up the sender with you API key
var sender = new gcm.Sender(gcmKey);

var ref = new Firebase('https://travelhackearth.firebaseio.com/');
var profilesRef = ref.child("profiles");
var queueRef = ref.child("queue/");
var passRef = ref.child("queue/passCount");
var regRef = ref.child("queue/regCount");

var firstTime = true;
passRef.on('value', function(snapshot){
  var passCount = snapshot.val();
  console.log('pass count listener::'+passCount);
  if(firstTime) {
    firstTime=false;
    return;
  }
  profilesRef.orderByChild("token").startAt(passCount).endAt(passCount+3).on("value", function(snapshot) {
    var regids = [];
    snapshot.forEach(function(data) {
      console.log(data.key() + " :: " + data.val());
      var profile = data.val();
      regids.push(profile.regId);  
    });
    var message = new gcm.Message();
    message.addData('data', passCount);
    sendnotifs(message, regids); 
  });
});
regRef.on('value', function(snapshot){
  console.log('reg count listener');
});
app.get('/', function(request, response) {
  response.render('public/index.html');
});

app.post('/register', function(request, response) {
  var result={};
  var req = request.body;
  console.log(req);
  if(!req.recloc || !req.lname) {
    response.send({'result':'invalid input'});
    return;
  }
  var endpointParts=req.endpoint.split('/');
  var registrationId = endpointParts[endpointParts.length - 1];  
  req.regId = registrationId;
  var profileRef = profilesRef.child(req.recloc);
  queueRef.once('value', function(snapshot){
    var queue = snapshot.val();
    profileRef.once('value', function(snapshot){
      var profile = snapshot.val();
      if(!profile) {
        queue.regCount += 1;
        req.token = queue.regCount;
        profileRef.set(req);
        queueRef.set(queue);
        result.token = queue.regCount;
        result.pass = queue.passCount;
        result.time = queue.avgTime;
        response.send({'result':result});
      } else{
        result.token = profile.token; 
        result.pass = queue.passCount;
        result.time = queue.avgTime;
        response.send({'result':result});
      }
    });
  });
  //retrieveTrip(req.lname, req.recloc);  
});

app.post('/unregister', function(request, response) {
  var req = request.body;
  console.log(req);
  var endpointParts=req.endpoint.split('/');
  var registrationId = endpointParts[endpointParts.length - 1];  
  req.regId = registrationId;  
  queueRef.once('value', function(snapshot){
    var queue = snapshot.val();
    queue.passCount += 1;
    queueRef.set(queue);        
  });
  profilesRef.once('value', function(snapshot){
    var profiles = snapshot.val();
    delete profiles[req.recloc];
    profilesRef.set(profiles);
  });  
  response.send({'result':'success'});
});

app.post('/notify', function(request, response) {
  var message = new gcm.Message();
  message.addData('key1', 'msg1');
  sendnotifs(message);
});

app.post('/initqueue', function(request, response) {
  var req = request.body;
  queueRef.once('value', function(snapshot){
    var queue = snapshot.val();
    queue.passCount = req.passCount;
    queue.regCount = req.regCount;
    queue.avgTime = req.avgTime;
    queueRef.set(queue);        
    response.send('updated');
    broadcast(queue);
  });
});

app.post('/pass', function(request, response) {
  queueRef.once('value', function(snapshot){
    var queue = snapshot.val();
    queue.passCount += 1;
    queueRef.set(queue);     
    broadcast(queue);
  });  
  response.send('updated');
  console.log('queue updated');
});

/*app.listen(port, function() {
  console.log('Node app is running on port', port);
});*/
var server = http.createServer(app)
server.listen(port)
console.log("http server listening on %d", port)

var wss = new WebSocketServer({server: server})
console.log("websocket server created")
var websocket;
wss.on("connection", function(ws) {
  websocket = ws;
  var result = {'status':'connected'}
  ws.send(JSON.stringify(result), function() {  })
  console.log("websocket connection open");
  ws.on("close", function() {
    console.log("websocket connection close");    
  });
})

app.get('/retrieve', function(request, response) {
  retrieveTrip();  
  response.send('calling');
});

var SABRE_API = 'XXXXXXYYYYYY'; //get it from sabre dev studio
var retrieveTrip = function(lname, recloc) {
  var trip='';
  https.get('https://xyz',
       function(res){
          //console.log("statusCode: ", res.statusCode);
          //console.log("headers: ", res.headers);

          res.on('data', function(d) {
            trip+=d;
          });
          res.on('end', function () {
            console.log(trip);
            trip = JSON.parse(trip);
            if(trip.travelers) {
              trip.travelers.map(function(traveler) {
                if(traveler.type=='CHILD') {
                  if(queuerank>3)
                  broadcastAds(traveler);
                }
              });
            }
          });
       }
  ).on('error', function(e) {
    console.error(e);
  });  
};

var sendnotifs = function(message, regids){
  sender.send(message, { registrationTokens: regids }, function (err, res) {
    if(err) 
      console.error(err);
    else    
      console.log(res);
    console.log('notifications sent to '+regids);
  });    
}

var broadcast=function(queue){
  var data = {pass:queue.passCount, time:queue.avgTime};
  websocket.send(JSON.stringify(data), function() {});
}

var broadcastAds = function(traveler){
  var promo=[
  {
    url: 'img/baby1.jpg',
    type:'child',
    title:'Showroom dedicated to babies'
  },
  {
    url: 'img/baby2.jpg',
    type:'child',
    title:'Clothes at great discount'
  },
  {
    url: 'img/baby3.jpg',
    type:'child',
    title:'Play area for babies'
  },
  {
    url: 'img/discount.jpg',
    type:'discount',
    title:'Awesome discount!!!'
  }
  ];
  var result = {promo: promo};
  websocket.send(JSON.stringify(result), function() {  });
}