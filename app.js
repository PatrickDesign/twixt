//April, 2019
//Author: Patrick Wees
//Program: app.js is the server logic for an online implementation of the board game
//'twixt'.  This site allows users to have multiple real-time games with either random users,
//or 'friends' and 'recent opponents'.  There is also a live chat system, that is enabled on a
//account-to-account level, as well as a dedicated chat box for each game.

////Todo's:
//1.) IMPROVE FRONT END ROUGH EDGES
//1a) NAVBAR
//2.) Create edit project page //DONE
//2a) Allow owners to add updates easily to projects //DONE
//3.) Special outline for project owners in comments section of their projects
//4.) Finish User dashboard //DONE
//5.) Create 'money' form to 'donate' //DONE

//6.) Organize codebase

//TODO:
//Follow users DONE
//create a user 'view' like dashboard, but for another user. DONE
//Display 'following users' DONE

//populate social feed with something. DONE

//APRIL 5 TODOS:
//Implement the backend for 'user is typing' in coversations //Prototyped :)
//Implement 'user is online' whenever a user is online (on any part of the site, not just the conversation page) //Working
//Although, we should also create a notification like snapchat that shows if the other user IS in the convo page
//at the time. //Prototyped :)

//Includes====================================================
var express = require("express");
// var jwt = require("jsonwebtoken");

var redis = require("redis");
var client = redis.createClient();
// const { promisify } = require("util");
// const getAsync = promisify(client.get).bind(client);

var dbConnection = require("./connections"); //get db connection
var app = express();
var http = require("http");
var server = http.createServer(app);
var io = require("socket.io").listen(server);
var bodyParser = require("body-parser");
// var cookieParser = require("cookie-parser");
var mongoose = require("mongoose"),
  passport = require("passport"),
  localStrategy = require("passport-local"),
  passportLocalMongoose = require("passport-local-mongoose");
var sharedSession = require("express-socket.io-session");
var fetch = require("node-fetch");
//End Includes=================================================

//Redis logic===============================

//Plan for this section:

//Use this to create a hashmap(s) to keep track of
//user's online friends:

//Algorithm:
//On socket connection to overall website,
//Create an online friends list quickly by
//checking the redis map, then store the list
//in redis, and use this list throughout the user's
//session, adding and deleting as users come and go.
//When a socket disconnects, we can delete the list.

client.on("connect", () => {
  console.log("connected to redis.....");
});

//==========================================

//=================Session:

var session = require("express-session")({
  secret: "secret",
  resave: true,
  saveUninitialized: true
});

app.use(session);

//=========================

//=============import schemas:
var User = require("./schemas/user");
var Project = require("./schemas/project");
var Comment = require("./schemas/comment");
var Update = require("./schemas/update");
var Notification = require("./schemas/notification");
var Conversation = require("./schemas/conversation");
var Message = require("./schemas/message");
app.use(bodyParser.urlencoded({ extended: true }));
//===========================

//======setup file structure:
app.use(express.static("public"));
app.set("view engine", "ejs");
app.set("views", "./views");
//=========================

//============AUTHENTICATION:
app.use(passport.initialize());
app.use(passport.session());

passport.use(new localStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

//GLOBALS
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  res.locals.sdgCategories = [
    "No Poverty",
    "Zero Hunger",
    "Good Health and Well-Being",
    "Quality Education",
    "Gender Equality",
    "Clean Water and Sanitation",
    "Affordable and Clean Energy",
    "Decent Work and Economic Growth",
    "Industry, Innovation and Infastructure",
    "Reduced Inequalities",
    "Sustainable Cities and Communities",
    "Responsible Production and Consumption",
    "Climate Action",
    "Life Below Water",
    "Life On Land",
    "Peace, Justice and Strong Institutions",
    "Partnerships for the Goals"
  ];

  //pass the online friends list to every view:
  if (req.user)
    res.locals.onlineFriends = JSON.parse(
      client.smembers(req.user._id.toString())
    );
  next();
});

//==========================

//ROUTES=========================

//MessageRoutes==================

//Show all conversations for a user
app.get("/conversations", (req, res) => {
  User.findById(req.user._id)
    .populate({
      path: "conversations",
      populate: [
        { path: "users" },
        { path: "messages", populate: { path: "author" } }
      ]
    })
    .exec((err, foundUser) => {
      if (err) console.log(err);
      else {
        return res.render("conversations", { user: foundUser });
      }
    });
});

//Finds an existing conversation or creates a new one if one does not exist.
app.post("/findConvo/:id", (req, res) => {
  User.findById(req.user._id)
    .populate({ path: "conversations", populate: { path: "users" } })
    .exec((err, foundUser) => {
      if (err) console.log(err);
      else {
        var conversationFound = false,
          convoIndex = 0,
          userInConvo;

        //search for conversation where user with 'id' is in user list

        if (foundUser.conversations) {
          foundUser.conversations.forEach(conversation => {
            userInConvo = conversation.users.findIndex(user =>
              user.equals(req.params.id)
            );

            if (userInConvo != -1) {
              conversationFound = true;
              return res.redirect(
                "/conversations/" + foundUser.conversations[convoIndex]._id
              );
            }

            convoIndex++;
          });
        }

        if (conversationFound) return;

        //else, create a new conversation and redirect there.

        //Find other recipient so we can modify attributes
        User.findById(req.body.user)
          .populate("conversations")
          .exec((err, userToTalkTo) => {
            if (err) console.log(err);
            else {
              Conversation.create({}, (err, newConvo) => {
                if (err) console.log(err);
                else {
                  console.log("ID: " + req.body.user);
                  //add conversation to both user's lists:
                  userToTalkTo.conversations.unshift(newConvo);
                  userToTalkTo.save();
                  foundUser.conversations.unshift(newConvo);
                  foundUser.save();

                  newConvo.users.unshift(userToTalkTo, foundUser);
                  newConvo.save();

                  return res.redirect("/conversations/" + newConvo._id); //render the new convo!
                }
              });
            }
          });
      }
    });
});

//Show the conversation of user with 'id'
app.get("/conversations/:id", (req, res) => {
  if (!req.user) return res.redirect("/");

  User.findById(req.user._id)
    .populate("conversations")
    .exec((err, foundUser) => {
      if (err) console.log(err);
      else {
        //Look for conversation with id
        //find the conversation and render the page
        Conversation.findById(req.params.id)
          .populate({ path: "users" })
          .populate({ path: "messages", populate: { path: "author" } })
          .exec((err, foundConvo) => {
            if (err) console.log(err);
            else {
              //check if the current user is in the conversation:
              if (foundConvo.users.find(user => user._id.equals(foundUser._id)))
                return res.render("messages", { conversation: foundConvo });

              res.send("<h1>You are not in this conversation... get out!</h1>");
            }
          });
      }
    });
});

//===============================

//UserRoutes======================

app.post("/users/:id/update", (req, res) => {
  if (req.body.inlineRadioOptions) {
    User.updateOne(
      { _id: req.user._id },
      { $set: { bio: req.body.userBio, avatar: req.body.inlineRadioOptions } },
      (err, updatedUser) => {
        if (err) console.log(err);
        else {
          res.redirect("/dashboard");
        }
      }
    );
  } else {
    User.updateOne(
      { _id: req.user._id },
      { $set: { bio: req.body.userBio } },
      (err, updatedUser) => {
        if (err) console.log(err);
        else {
          res.redirect("/dashboard");
        }
      }
    );
  }
});

//Follow/Unfollow logic:

app.post("/users/:id/follow", (req, res) => {
  User.findById(req.params.id, (err, userGettingFollowed) => {
    if (err) console.log(err);
    else {
      User.findById(req.user._id, (err, userDoingTheFollowing) => {
        if (err) console.log(err);
        else {
          userGettingFollowed.followers.unshift(userDoingTheFollowing);
          userDoingTheFollowing.followedUsers.unshift(userGettingFollowed);

          userDoingTheFollowing.save();
          userGettingFollowed.save((err, savedUser) => {
            if (err) console.log(err);
            //redirect back to user we just followed
            else return res.redirect("/users/" + req.params.id);
          });
        }
      });
    }
  });
});

//Unfollow a user
app.post("/users/:id/unfollow", (req, res) => {
  User.findById(req.params.id, (err, userGettingUnFollowed) => {
    if (err) console.log(err);
    else {
      User.findById(req.user._id, (err, userDoingTheUnFollowing) => {
        if (err) console.log(err);
        else {
          //Remove the 'unfollower' from the 'unfollowed's list
          userGettingUnFollowed.followers.forEach((follower, index) => {
            if (follower.equals(userDoingTheUnFollowing._id))
              userGettingUnFollowed.followers.splice(index, 1);
          });

          //Remove the unfollowed user from the unfollower's list
          userDoingTheUnFollowing.followedUsers.forEach(
            (userFollowed, index) => {
              if (userFollowed.equals(userGettingUnFollowed._id))
                userDoingTheUnFollowing.followedUsers.splice(index, 1);
            }
          );

          userDoingTheUnFollowing.save();
          userGettingUnFollowed.save((err, savedUser) => {
            if (err) console.log(err);
            //redirect back to user we just followed
            else return res.redirect("/users/" + req.params.id);
          });
        }
      });
    }
  });
});

//Route to view a generic user's account
app.get("/users/:id", (req, res) => {
  User.findById(req.params.id)
    .populate({
      path: "comments",
      populate: { path: "author" },
      options: { sort: { rating: -1 } }
    })
    .populate("followedUsers")
    .populate("followers")
    .populate("followedProjects")
    .populate("ownedProjects")
    .exec((err, foundUser) => {
      if (err) console.log(err);
      else {
        return res.render("viewUser", { user: foundUser });
      }
    });
});

//===============================

app.get("/projects/:id", (req, res) => {
  //find the project with id (get the ID from the URL)
  //sort comments by 'rating'
  Project.findById(req.params.id)
    .populate({
      path: "comments",
      populate: { path: "author" },
      options: { sort: { rating: -1 } }
    })
    .populate({
      path: "updates",
      populate: { path: "author" }
    })
    .populate("owners")
    .exec((err, foundProject) => {
      if (err) console.log(err);
      else {
        res.render("projectPage", {
          project: foundProject,
          isLoggedInFlag: isLoggedInFlag(req, res)
        }); //render view template with that project
      }
    });
});

//COMMENT ROUTES=========================

//create a new comment
app.post("/projects/:id/comments", (req, res) => {
  //Add comment to both project history and user history.

  //query to find the user db object:
  User.findById(req.user._id, (err, foundUser) => {
    if (err) console.log(err);
    else {
      Project.findById(req.params.id, (err, foundProject) => {
        if (err) {
          console.log(err);
          res.redirect("/projects/" + req.params.id);
        } else {
          //on success,

          //create comment
          Comment.create(
            {
              text: req.body.commentText,
              author: foundUser,
              project: foundProject
            },
            (err, createdComment) => {
              foundUser.comments.unshift(createdComment); //add comment to found user's comments array.
              foundUser.save(); //update db

              foundProject.comments.unshift(createdComment); //push comment to front of array of comments in project.
              foundProject.save((err, savedProject) => {
                res.redirect("/projects/" + req.params.id);
              });
            }
          );
        }
      });
    }
  });
});

//UPVOTE a comment:
app.post("/projects/:id/comments/:commentId/upvote", (req, res) => {
  if (isLoggedInFlag(req, res)) {
    Comment.updateOne(
      { _id: req.params.commentId },
      { $inc: { rating: 1 } },
      (err, foundComment) => {
        if (err) console.log(err);
        else {
          //redirect back to project (might want to make ajax later to avoid refresh)
          res.redirect("/projects/" + req.params.id);
        }
      }
    );
  } else {
    res.redirect("/login");
  }
});

//DOWNVOTE a comment:
app.post("/projects/:id/comments/:commentId/downvote", (req, res) => {
  if (isLoggedInFlag(req, res)) {
    Comment.updateOne(
      { _id: req.params.commentId },
      { $inc: { rating: -1 } },
      (err, foundComment) => {
        if (err) console.log(err);
        else res.redirect("/projects/" + req.params.id);
      }
    );
  } else {
    res.redirect("/login"); //redirect back to login page (need to fix UX =>redirect back to original project once they login.)
  }
});

//========================================

app.get("/about", (req, res) => {
  res.render("about");
});

app.get("/dashboard", (req, res) => {
  User.findById(req.user._id)
    .populate({
      path: "comments",
      populate: [{ path: "author" }, { path: "project" }],
      options: { sort: { rating: -1 } }
    })
    .populate("followedUsers")
    .populate("followers")
    .populate("followedProjects")
    .populate("ownedProjects")
    .exec((err, foundUser) => {
      if (err) console.log(err);
      else {
        res.render("dashboard", { user: foundUser });
      }
    });
});

app.get("/explore", (req, res) => {
  if (Object.keys(req.query).length > 0) {
    //Display only the projects with this category
    var categoryName = req.query.category;
    Project.find({ sdgCategory: categoryName }, (err, foundProjects) => {
      if (err) console.log(err);
      else {
        res.render("explore", { projects: foundProjects });
      }
    });
  } else {
    //Start displaying all projects
    Project.find({}, (err, foundProjects) => {
      if (err) console.log(err);
      else {
        res.render("explore", { projects: foundProjects });
      }
    });
  }
});

//Filter routes:
app.post("/explore", (req, res) => {
  Project.find({ sdgCategory: req.body.sdgCategory }, (err, foundProjects) => {
    if (err) console.log(err);
    else res.redirect("/explore?category=" + req.body.sdgCategory);
  });
});

app.get("/search", (req, res) => {
  res.render("search");
});

//SEARCH
app.post("/search", (req, res) => {
  Project.find({ $text: { $search: req.body.projectSearch } })
    .limit(10)
    .exec(function(err, foundProjects) {
      if (err) console.log(err);
      else {
        res.render("search", { projects: foundProjects });
      }
    });
});

app.get("/contact", (req, res) => {
  res.render("contact");
});

app.get("/register", (req, res) => {
  res.render("addUser");
});

app.post("/register", (req, res) => {
  User.register(
    new User({
      username: req.body.username,
      email: req.body.email,
      avatar: req.body.inlineRadioOptions,
      bio: req.body.userBio
    }),
    req.body.password,
    (err, user) => {
      if (err) {
        return res.redirect("/register");
      }
      passport.authenticate("local")(req, res, () => {
        res.redirect("/");
      });
    }
  );
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.post(
  "/login",
  passport.authenticate("local", {
    failureRedirect: "/login"
  }),
  (req, res) => {
    console.log("User " + req.user.username + " has logged in...");
    req.session.user = req.user;
    res.redirect("/");
  }
);

app.get("/logout", (req, res) => {
  //deal with online status....
  removeUserFromOnlineLists(req.user._id.toString());
  client.del(req.user._id.toString()); //delete user from online map

  //actually log the user out and redirect to the home page :)
  req.logout();
  res.redirect("/");
});

//////////////

app.get("/", (req, res) => {
  Project.find({}, function(err, allProjects) {
    if (err) console.log(err);
    else {
      Project.find({ $expr: { $gte: ["$earnings", "$goal"] } }, function(
        err,
        finishedProjects
      ) {
        if (err) console.log(err);
        else {
          if (req.user) {
            User.findById(req.user._id)
              .populate({
                path: "notifications",
                populate: [{ path: "author" }, { path: "project" }]
              })
              .exec((err, foundUser) => {
                if (err) console.log(err);
                else {
                  res.render("index", {
                    projects: allProjects,
                    finishedProjects: finishedProjects,
                    user: foundUser
                  });
                }
              });
          } else {
            res.render("index", {
              projects: allProjects,
              finishedProjects: finishedProjects
            });
          }
        }
      });
      // res.render("index", { projects: allProjects });
    }
  });
});

app.get("/addProject", (req, res) => {
  res.render("addProject");
});

app.get("/viewUsers", (req, res) => {
  User.find({}, function(err, allUsers) {
    if (err) console.log(err);
    else {
      res.render("newUsers", { users: allUsers });
    }
  });
});

app.post("/projects/:id/updates/addUpdate", (req, res) => {
  //Find the current author:
  User.findById(req.user._id, (err, foundUser) => {
    if (err) console.log(err);
    else {
      //now find the project that we are adding the update to:
      Project.findById(req.params.id)
        .populate("followingUsers")
        .exec((err, foundProject) => {
          if (err) console.log(err);
          else {
            //Create the update:
            Update.create(
              {
                title: req.body.newUpdateTitle,
                author: foundUser,
                img: req.body.newCoverPath,
                updateText: req.body.newUpdateText
              },
              (err, newUpdate) => {
                //Add notifications to all following users
                Notification.create(
                  {
                    title: foundProject.name + " just posted a new update",
                    type: "PU", //Project update
                    project: foundProject,
                    author: foundUser,
                    notificationBody: req.body.newUpdateText.substring(0, 200)
                  },
                  (err, createdNotif) => {
                    if (err) console.log(err);
                    else {
                      //Send notification to all following users:
                      foundProject.followingUsers.forEach(followingUser => {
                        User.findById(followingUser, (err, userToUpdate) => {
                          if (err) console.log(err);
                          else {
                            userToUpdate.notifications.unshift(createdNotif);
                            userToUpdate.save();
                          }
                        });
                      });
                    }
                  }
                );

                if (err) console.log(err);
                else {
                  //now we have the project and the user, and the update
                  foundProject.updates.unshift(newUpdate);
                  foundUser.updates.unshift(newUpdate);
                  foundUser.save();
                  foundProject.save((err, savedProject) => {
                    if (err) console.log(err);
                    else res.redirect("/projects/" + req.params.id);
                  });
                }
              }
            );
          }
        });
    }
  });
});

app.get("/projects/:id/updates/addUpdate", (req, res) => {
  User.findById(req.user._id, (err, foundUser) => {
    if (err) console.log(err);
    else {
      console.log("Found user");
      Project.findById(req.params.id, (err, foundProject) => {
        if (err) console.log(err);
        else {
          console.log("Found project");
          //At this point, we found the user and the project
          return res.render("addUpdate", {
            project: foundProject,
            user: foundUser
          });
        }
      });
    }
  });

  // return res.redirect("/projects/" + req.params.id);
});

//Update a project's earnings field
app.post("/projects/:id/acceptPayment", (req, res) => {
  // req.body.donationAmount contains the amount to update project by
  Project.findById(req.params.id, (err, projectToUpdate) => {
    if (err) console.log(err);
    else {
      if (req.body.donationAmount > 0) {
        User.findById(req.user._id, (err, foundUser) => {
          if (err) console.log(err);
          else {
            projectToUpdate.earnings =
              parseInt(projectToUpdate.earnings) +
              parseInt(req.body.donationAmount);
            var isInArray = projectToUpdate.backers.some(_id => {
              return foundUser._id.equals(_id);
            });
            if (!isInArray) {
              projectToUpdate.backers.unshift(foundUser);
            }
            foundUser.contributed =
              parseInt(foundUser.contributed) +
              parseInt(req.body.donationAmount);
            foundUser.save();
            projectToUpdate.save((err, project) => {
              return res.redirect("/projects/" + projectToUpdate._id);
            });
          }
        });
      } else {
        return res.redirect("/projects/" + projectToUpdate._id);
      }
    }
  });
});

//FOLLOW A PROJECT
app.post("/projects/:id/follow", (req, res) => {
  if (isLoggedInFlag(req, res)) {
    Project.findById(req.params.id, (err, foundProject) => {
      if (err) console.log(err);
      else {
        User.findById(req.user._id, (err, foundUser) => {
          if (err) console.log(err);
          else {
            foundUser.followedProjects.unshift(foundProject); //add project to user following list
            foundUser.save();
            foundProject.followingUsers.unshift(foundUser); //add user to project followers list
            foundProject.save((err, project) => {
              res.redirect("/projects/" + req.params.id);
            });
          }
        });
      }
    });
  } else {
    res.redirect("/login");
  }
});

//UNFOLLOW a project
app.post("/projects/:id/unfollow", (req, res) => {
  Project.findById(req.params.id, (err, foundProject) => {
    if (err) console.log(err);
    else {
      User.findById(req.user._id, (err, foundUser) => {
        if (err) console.log(err);
        else {
          //Remove project from user list, and user from project list
          foundUser.followedProjects.forEach((project, index) => {
            if (project.equals(foundProject._id))
              foundUser.followedProjects.splice(index, 1);
          });

          foundProject.followingUsers.forEach((user, index) => {
            if (user.equals(foundUser._id))
              foundProject.followingUsers.splice(index, 1);
          });

          foundUser.save();
          foundProject.save((err, newProjectName) => {
            res.redirect("/projects/" + req.params.id);
          });
        }
      });
    }
  });
});

//Actually edit a project model:
app.post("/projects/:id/edit", (req, res) => {
  Project.updateOne(
    { _id: req.params.id },
    {
      $set: {
        FAQ: req.body.newProjectFAQ,
        about: req.body.newProjectAbout,
        description: req.body.newProjectDescription,
        coverPath: req.body.newCoverPath
      }
    },
    (err, updatedProject) => {
      if (err) console.log(err);
      else {
        return res.redirect("/projects/" + req.params.id);
      }
    }
  );
});

//Edit a project (view):
//could create 'isProjectOwner' middleware
app.get("/projects/:id/edit", (req, res) => {
  if (req.user == null) {
    return res.redirect("/projects/" + req.params.id);
  }

  Project.findById(req.params.id, (err, foundProject) => {
    if (err) console.log(err);
    else {
      //check if user is owner of requested project:
      var isInArray = foundProject.owners.some(projectOwner => {
        return projectOwner.equals(req.user._id);
      });

      if (isInArray) {
        return res.render("projectEdit", { project: foundProject });
      } else {
        return res.redirect("/projects/" + req.params.id);
      }
    }
  });
});

app.post("/addProject", (req, res) => {
  var newId = mongoose.Types.ObjectId();

  var currProject = new Project({
    name: req.body.newProjectName,
    coverPath: req.body.newCoverPath,
    description: req.body.newProjectDescription,
    about: req.body.newProjectAbout,
    FAQ: req.body.newProjectFAQ,
    goal: req.body.newProjectGoal,
    sdgCategory: req.body.newProjectSDGGoal,
    fundingType: req.body.newProjectFundingType,
    sdgCategory: req.body.newProjectSDGCategory,
    _id: newId
  });

  currProject.save((err, createdProject) => {
    //Associate owners with a project.
    User.findById(req.user._id, (err, foundUser) => {
      if (err) console.log(err);
      else {
        //Adding owner information to project object.
        createdProject.owners.unshift(foundUser);
        foundUser.ownedProjects.unshift(createdProject);
        foundUser.save();
        createdProject.save();
      }
    });

    res.redirect("/projects/" + createdProject._id); //redirect to newly created project
  });
});

//END ROUTES========================

//SOCKET LOGIC======================

//create a conversation namespace.
var conversationSpace = io.of("/conversations");

//io = io.listen(server);
conversationSpace.use(sharedSession(session));
io.use(sharedSession(session));

conversationSpace.on("connection", socket => {
  console.log(socket.handshake.session.user.username + " has connected!");

  socket.on("convoJoin", data => {
    console.log(
      socket.handshake.session.user.username +
        " has connected to room: " +
        data.convoID
    );
    socket.join(data.convoID);
  });

  //Handles all database steps to save the message
  socket.on("newMessage", data => {
    //Find conversation and add the new message
    Conversation.findById(data.convo)
      .populate({ path: "messages", populate: { path: "author" } })
      .exec((err, foundConvo) => {
        if (err) console.log(err);
        else {
          //add new message to conversation

          //Find the user who is the author
          User.findById(socket.handshake.session.user._id, (err, foundUser) => {
            if (err) console.log(err);
            else {
              //create message
              Message.create(
                {
                  author: foundUser,
                  messageText: data.message
                },
                (err, newMessage) => {
                  //Now we have a created message. We must now add it
                  //to the conversation.

                  foundConvo.messages.unshift(newMessage);
                  foundConvo.save();
                  // return res.redirect('/conversations/' + foundConvo._id)

                  socket.broadcast.to(data.convo).emit("incomingMessage", {
                    message: data.message,
                    user: foundUser
                  });
                }
              );
            }
          });
        }
      });

    conversationSpace.to(data.convo).emit("messageSent", data.message);
  });

  //When a user is typing
  socket.on("imTyping", data => {
    //emit friendTyping
    socket.broadcast.to(data.convo).emit("friendTyping", data.user);
  });

  //Check if friend is online:
  // socket.emit('isFriendOnline', {convo: "<%= conversation._id %>"});

  socket.on("isFriendInConvo", data => {
    var friend;

    //Todo: fix this linen!!!
    io.of("/conversations")
      .in(data.convo)
      .clients((error, clients) => {
        friend = clients.find(
          client =>
            conversationSpace.connected[client].handshake.session.user._id !==
            socket.handshake.session.user._id
        ); //use FIND

        // if(typeof friend === 'object'){
        if (friend)
          conversationSpace.connected[socket.id].emit("friendIsInConvo", {
            user: conversationSpace.connected[friend].handshake.session.user
          });
        else conversationSpace.connected[socket.id].emit("friendIsNotInConvo");
      });
  });
}); //end of conversationSpace channel logic

//UTIL FUNCTIONS TO MOVE TO NEW FILE

//usage: asyncParse(jsonString).then((result) => {});
// function asyncParse(string) {
//   return (new Response(string)).json();
// }

//==================================

// async function printFriendsList(socket) {
//     if (socket.handshake.session && socket.handshake.session.user) {

//         client.exists(socket.handshake.session.user._id.toString(), async (err, exists) => {
//             if (err)
//                 consol.log(err);
//             else {
//                 if (exists) {

//                     // client.llen(socket.handshake.session.user._id.toString(), (err, foundLength) => {
//                     //     if (err)
//                     //         console.log(err);
//                     //     else {
//                     //         if (foundLength)
//                     //             console.log("================ONLINE FRIENDS================");

//                     //     }
//                     // });
//                     // const onlineFriends = await client.hgetall(socket.handshake.session.user._id, (err, friends) => {
//                     //     console.log(friends);
//                     // });
//                     // onlineFriends.forEach((friend) => {
//                     //     console.log(JSON.parse(friend).username);
//                     // })
//                 }
//             }
//         });

//         // socket.handshake.session.onlineFriendsList.forEach((friend) => {
//         //   friend = JSON.parse(friend);
//         //   console.log(friend.username);
//         // });
//     }
// }

//Check if a redis entry exists for 'element'
// function asyncExists(element) {
//   return new Promise(resolve => {
//     const onlineStatus = client.exists(element, (err, isOnline) => {
//       resolve(isOnline);
//     });
//   });
// }

//FriendsList todo:

//Remove from lists when user is disconnected (see addToDisconnectList())

async function checkForUser(socket) {
  //check if the socket.handshake.session.user._id is within our hashmap of online users
  //=>if not, add the user to our hashmap
  //=>else, do nothing.

  //check if the user.id is in redis. if so do nothing
  if (socket.handshake.session && socket.handshake.session.user)
    //check if we have a logged in user

    client.exists(
      socket.handshake.session.user._id.toString(),
      (err, foundUser) => {
        //If we don't have an entry for this user yet, generate a new online friends list!
        if (!foundUser) {
          //I prefixed these variables with 'u_' so that when we eventually retrieve
          //this object from redis, we can reference the values as they would appear in Mongo:
          //user._id, etc.
          let u_user = socket.handshake.session.user,
            u_id = u_user._id,
            u_username = u_user.username,
            u_bio = u_user.bio,
            jsonUser = JSON.stringify({
              _id: u_id,
              username: u_username,
              bio: u_bio
            });

          var onlineFriends = [];
          var numOnline = 0,
            currOnline = false;

          //generate onlinefriendsList for this user for the first time upon log in.
          User.findById(u_id)
            .populate("followers")
            .exec(async (err, foundUser) => {
              if (err) console.log(err);
              else {
                //Go through each friend in user's follower list ( will change this to friends list )
                //and check if they are online by checking if there is a redis entry for the friend's user._id

                for (const follower of foundUser.followers) {
                  currOnline = await asyncExists(follower._id.toString());
                  if (currOnline) {
                    currOnline = false;
                    numOnline++;
                    console.log(follower.username + " is online!");

                    onlineFriends.push(
                      JSON.stringify({
                        _id: follower._id.toString(),
                        username: follower.username,
                        bio: follower.bio
                      })
                    );
                  }
                }
                // foundUser.followers.forEach(async (follower) => {

                //     currOnline = await asyncExists(follower._id.toString());
                //     if (currOnline) {
                //         currOnline = false;
                //         numOnline++;
                //         console.log(follower.username + ' is online!');

                //         onlineFriends.push(JSON.stringify({ _id: follower._id.toString(), username: follower.username, bio: follower.bio }));
                //     }

                // });
                console.log(
                  `${u_username} has ${numOnline} ${
                    numOnline == 1 ? "friend" : "friends"
                  } online`
                );

                //Add the user to their own online friends list, so that
                //the list does not get removed if no friends are online
                client.sadd(u_id.toString(), jsonUser);

                //If we have online friends, push them to our redis set.
                if (numOnline != 0) {
                  client.sadd(u_id, ...onlineFriends, (err, reply) => {
                    if (err) console.log(err);
                  });
                }
              }
            });
        } else {
          console.log(
            `${socket.handshake.session.user.username} is already online!`
          );
          removeFromDisconnectedList(socket.handshake.session.user._id);
        }
      }
    );
}

function removeFromDisconnectedList(user) {
  //remove user from disconnected list.

  client.srem("disconnectedUsers", user, (err, reply) => {
    if (err) console.log(err);
  });
}

//the main io handles all connections:

io.on("connection", socket => {
  socket.on("logout", () => {
    if (socket.handshake.session && socket.handshake.session.user) {
      delete socket.handshake.session.user;
      socket.handshake.session.save();
    }
  });

  checkForUser(socket);

  socket.on("disconnect", () => {
    //check if there is a user associated with the socket
    //if so => remove from hashmap
    //Or, do nothing.

    //send an alert that we disconnected,

    if (socket.handshake.session && socket.handshake.session.user)
      addToDisconnectList(socket);
  });
});

function asyncExists(element) {
  return new Promise(resolve => {
    client.exists(element, (err, isOnline) => {
      resolve(isOnline);
    });
  });
}

function asyncSetCheck(listToCheck, member) {
  return new Promise(resolve => {
    client.sismember(listToCheck, member, (err, reply) => {
      resolve(reply);
    });
  });
}

async function checkDisconnectedList(user) {
  let onlineStatus;
  return new Promise(resolve => {
    setTimeout(async () => {
      onlineStatus = await asyncSetCheck("disconnectedUsers", user);
      resolve(onlineStatus);
    }, 10000);
  });
}

async function addToDisconnectList(socket) {
  //outline: when a user disconnects, add them to disconnectedUsers list
  //If the user reconnects, immediately remove them from the list
  //If the user is still in disconnected list after 10 seconds, remove user from
  //online friends lists'.

  //add to a list of users we are waiting to reconnect.
  console.log(
    `adding ${socket.handshake.session.user.username} to disconnected list...`
  );
  client.sadd(
    "disconnectedUsers",
    socket.handshake.session.user._id.toString()
  );

  const userStillDisconnected = await checkDisconnectedList(
    socket.handshake.session.user._id.toString()
  );
  //if they are still disconnected, remove their entry in redis
  if (userStillDisconnected) {
    console.log(
      `Removing ${socket.handshake.session.user.username} from online list!`
    );
    client.srem(
      "disconnectedUsers",
      socket.handshake.session.user._id.toString()
    ); //remove user from disconnected list.

    //Remove this user_id from all connected friends online lists'
    removeUserFromOnlineLists(socket.handshake.session.user._id.toString());

    client.del(socket.handshake.session.user._id.toString()); //delete user from online map
  } else {
    console.log(
      `${socket.handshake.session.user.username} has returned online!`
    );
  }
}

//This function will loop though the user's online friends list,
//and remove user from their lists:
function removeUserFromOnlineLists(user) {
  client.smembers(user, async (err, onlineFriends) => {
    if (err) console.log(err);
    else {
      //remove user from all lists in (reply):
      for (const listToRemoveFrom of onlineFriends) {
        //check if the list we are about to remove from still exists:
        client.exists(listToRemoveFrom, (err, exists) => {
          if (exists) client.srem(listToRemoveFrom, user); //remove user from friend's online list
        });
      }
    }
  });
}

io.on("getListOfOnlineFriends", data => {
  //search hashmap for all of the id's of the friend and add each friend to the online list.
  //Need to do this more efficiently, I don't want to search for all friends every time I want to display...
  //Ideas => add array attribute to user objects that holds all online users
  //=>however, I would need to update all arrays when a user logs out....
});

io.set("authorization", (handshakeData, accept) => {
  //  console.log(handshakeData.headers);

  //  if(handshakeData.headers.user)
  //    console.log("hello, " + handshakeData.headers.user.username);

  accept(null, true);

  /* if(handshakeData.headers.cookie){
  
      handshakeData.cookie = cookie.parse(handshakeData.headers.cookie);
      handshakeData.sessionID = connect.utils.parseSignedCookie(handshakeData.cookie['express.sid'], 'secret');

      if(handshakeData.cookie['express.sid
  
  
    }*/
});

/* io.on('connection', function(socket){

  if(socket.handshake.session.user)
    console.log("WELCOME TO TWIXT, " + socket.handshake.session.user.username);
  else
    console.log("hello there, friend.");




}); */

//==================================

//Helper functions

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next;

  res.redirect("/login");
}

function isLoggedInFlag(req, res) {
  if (req.isAuthenticated()) return true;
  return false;
}

///////

//SPINUP SERVER
const port = process.env.PORT || 3000;
server.listen(port, () => {
  client.flushdb(function(err, succeeded) {
    console.log("deleted redis entries..."); // will be true if successful
  });
  console.log("Serving app...");
});
