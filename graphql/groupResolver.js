const Workspace = require('../models/Workspace');
const board = require('../models/Board');
const { ObjectId } = require('mongodb');
const{ errorHandle } = require('../util/errorHandling');
const Board = require('../models/Board');
const List = require('../models/List');
const Task = require('../models/Task');
const Comment = require('../models/Comment');
const User = require('../models/User')
const { sendEmail } = require('../Middleware/sendMail');
const { v4: uuid4 } = require('uuid');
const { restart } = require('nodemon');
const {getIO} = require('../util/socket')

module.exports = {
    addUser: async function ({ userId, workSpaceId }, req) {
        if (!req.auth) {
            throw errorHandle('Not authorized', 400);
        }
        try {
            const workspace = await Workspace.findOne({ _id: workSpaceId });
            if (!workSpaceId) {
                const error = new Error();
                error.data = 'Workspace not found';
                error.code = 404;
                throw error;
            }
            const user = workspace.Users.includes(userId);
            if (user) {
                const error = new Error()
                error.data = 'User already exists'
                error.code = 400
                throw error
            }
                const objId = ObjectId.createFromHexString(userId);
                workspace.Users.push(objId)
                await workspace.save();
                return 'User added to workspace successfully';
        
        } catch (err) {
            throw err;
        }
    },
    removeUser: async function ({ userId, workSpaceId }, req) {
        if (!req.auth) {
            const error = new Error();
            error.data = 'Not authenticated';
            error.code = 401;
            throw error;
        }
        try {
            const workspace = await Workspace.findById(workSpaceId);
            if (!workspace) {
                const error = new Error();
                error.data = 'Workspace does not found';
                error.code = 404;
                throw error;
            }
            if (!workspace.Users.includes(userId)) {
                const error = errorHandle('User already does not exist in this workspace',404)
                throw error;
            }
            if (!workspace.Admin.includes(req.current.id) || workspace.Creator==userId) {
                const error = errorHandle('Not authorized, only admins can remove members', 403);
                throw error;
            }
            await Workspace.updateOne({ _id: workSpaceId }, { $pull: { Users: userId, Admin: userId } })
            return 'User removed successfully from workspace'
        } catch (err) {
            throw err;
        }
    },
    inviteUser: async function ({ workSpaceId, email }, req) {
        if (!req.auth) {
            throw errorHandle('Not authenticated', 400);
        }
        if (!workSpaceId || !email) throw errorHandle('Incorrect input data', 400);

        try {
            const workspace = await Workspace.findById(workSpaceId, { Admin: 1, Users: 1 }).populate('Users', 'Email');
            if (workspace.Admin.indexOf(req.current.id) != -1) {
                if (workspace.Users.findIndex(i => i.Email == email) != -1) {
                    throw errorHandle('User already exists in this workspace', 400);
                }
                const user = await User.findOne({ Email: email }, { Username: 1 });
                const date = new Date();
                const link = `https://workspaceInvitation/verify/${uuid4()}/${workSpaceId}/${date}`;
                sendEmail(email,
                    `Dear ${user.Username},
                 We would like to invite you to our workspace.
                 If you are interested, please click on the link below. 
                ${link}
                `
                    , 'Workspace invitation')
                return true;

            } else {
                throw errorHandle('Not authorized', 403);
            }
        } catch (err) { throw err; }
    },
    acceptInvitation: async function ({ workSpaceId , date }, req) {
        if (!req.auth) throw errorHandle('Not authenticated', 400);
        if (!workSpaceId) throw errorHandle('Incorrect input data', 400);
        let diff = new Date().getTime() - new Date(date).getTime();
        const days = diff / (1000 * 60 * 60 * 24); // number of days
        if (days < 7) {
            const workspace = await Workspace.findOne({ _id: workSpaceId, Users: { $in: req.current.id } });
            if (workspace) {
                throw errorHandle('You already in this workspace', 400);
            }
            try {
                await Workspace.updateOne({ _id: workSpaceId }, { $push: { Users: req.current.id } });
                return true;
            } catch (err) {
                throw err;
            }
        } else {
            throw errorHandle('Invitation link has expired', 404);
        }
    },
    createBoard: async function ({ inputData , workspaceId }, req) {
        const Title = inputData.Title;
        const Creator = inputData.Creator; 
        if (!req.auth) {
            const error = errorHandle('Not authenticated', 400);
            throw error;
        }
        try {
            const workspace = await Workspace.findOne({ _id: workspaceId, Admin: { $in: req.current.id } });
            if (!workspace) {
                throw errorHandle('Workspace not found or User is not an admin in this WS', 404);
            }
            let boards = await Workspace.findOne({ _id: workspaceId }).populate({ path: 'Boards', select: 'Title' });
            for (var i of boards.Boards) {
                if (i.Title == Title) {
                    throw errorHandle('This board name already used in this workspace, please select another name');
                }
            }
            let board = new Board({
                Title: Title, Creator: Creator
            })
            board = await board.save();
            workspace.Boards.push(board._id);
            await workspace.save();
            let res = { msg: 'Board created successfully', board: board, status: true }
            let sockets = getIO();
            const members = workspace.Users;
            members.forEach(i => {
                console.log(i+ " "+sockets.userSocket[i.toString()])
                if (sockets && sockets.userSocket[i.toString()] && i.toString() != req.current.id.toString()) {
                    sockets.to(sockets.userSocket[i.toString()]).emit('createBoard', { baordId: board._id, board: board });
                }
            })
            return res;
        } catch (err) {
            throw err;
        }
    },  createWorkSpace: async function ({ inputData }, req) {  
          if (!req.auth) {
            const error = errorHandle('Not authenticated', 400);
            throw error;
        }
        let user = [], Board = []
        user = inputData.User;
        Board = inputData.Board
        const Title = inputData.Title
        const Admin = inputData.Admin
        isPublic = inputData.isPublic?inputData.isPublic:false
        try {
            let res = { msg: "", ws: [], status: false };
            let workspace = new Workspace({
                user, Board, Title, Admin, isPublic,
                Creator: req.current.id , Admin: [req.current.id],Users :[req.current.id]
            })
             await workspace.save()
            res.ws = [workspace]
            res.msg = "WorkSspace created successfully"
            res.status = true         
            return res
        } catch (err) {
            throw err
        }

    },
    enterWorkSpace: async function ({ id }, req) {
         if (!req.auth) {
            const error = errorHandle('Not authenticated', 400);
            throw error;
        }
        if (!id) {
            const error = new Error("ID is required");
            error.code = 400;
            throw error;
        }
    
        try {
            let res = { msg: "", ws: [], status: false };
            var workspace = await Workspace.findOne({ _id: id }, { inviteLink: 0, LinkExpiryDate: 0 }).populate('Users', 'Username Email').populate('Creator', 'Username Email');
            if (workspace) {
                let stringIds = []
                workspace.Users.forEach(i => {
                    stringIds.push(i._id.toString())
                })
                workspace.Admin.forEach(i => {
                    console.log(i._id.toString())
                })
            
                if (stringIds.includes((req.current.id))|| (workspace.Admin.findIndex(i=>i._id.toString()==req.current.id.toString())!=-1)) {
                    res.msg = "Success"
                    res.ws.push(workspace)
                    res.status = true
                    return res
                }
            }
            return new Error("Not authorized")
        } catch (err) {
            throw err
        }
     
    },
    chooseBoard: async function ({ id }, req) {
        if (!req.auth) {
            const error = errorHandle('Not authenticated', 400);
            throw error;
        }
        if (!id) {
            const error = new Error("Board ID is required");
            error.code = 400;
            throw error;
        }
        try {
            const board = await Board.findOne({ _id: id }).
                populate({
                    path: 'Lists',
                    select: 'Creator Tasks',
                    populate: {
                        path: 'Creator',
                        select: 'username'
                    },
                    populate: {
                        path: 'Tasks',
                        select: 'Title'
                    },
            
                });
            if (Board) {
                return { ...board._doc, _id: board._id?.toString(), lists: board.Lists._id?.toString(), tasks: board.Lists.Title, Creator: board.Creator.toString(), Title: board.Title }
            }
            else {
                throw new Error("Board doesnot exist");
            }
        } catch (err) {
            throw err;
        }
    
    },
    searchBoard: async function ({ boardName, workSpaceId }, req) {
         if (!req.auth) {
            const error = errorHandle('Not authenticated', 400);
            throw error;
        }
        if (!boardName) {
            const error = new Error("Board name is required");
            error.code = 400;
            throw error;
        }

        try {
            let boards = await Board.find({
            Title: { $regex: `^${boardName}`, $options: 'i' } // Prefix search with case-insensitive option
            });
            if (boards) {
                const ws = await Workspace.findOne({ _id: workSpaceId });
                boards = boards.filter(i => {
                    if (ws.Boards.includes(i._id)) return true;
                    else return false
                })
                const result = boards.map(board => ({
                    _id: board._id.toString(),
                    lists: board.Lists.map(list => list._id.toString()),
                    tasks: board.Lists.Title,
                    Creator: board.Creator.toString(),
                    Title: board.Title
                }));

                return result;
            }
            else {
                throw new Error("No boards found")
            }

        } catch (error) {
            console.error('Error searching for boards:', error);
            throw new Error('Error searching for boards');
        }
    },
    getWorkSpace: async function (args,req) {
        // if (req.auth) {
            let res = { msg: "", ws: [], status: false };
            try {
                let availWorkSpace = await Workspace.find({ Users: { $in: req.current.id } }, { inviteLink: 0, LinkExpiryDate: 0 }).populate('Users', 'Username Email').populate('Creator', 'Username Email');
                if (availWorkSpace) {
                    res.msg = "These are the workspaces"
                    res.ws = availWorkSpace
                    res.status = true
                    return res;
                }
                res.msg = "No Workspaces"
                res.status = false
                return res;
            
            
            }
            catch (err) {
            throw new Error(err)
        }
        // }
        return new Error("Not auth");
    },
    addList: async function ({ inputList }, req) {
        if (req.auth) {
            let res = { msg: 'Missing fields', board: {}, status: false };
            if (inputList.workSpaceId && inputList.boardId) {
                try {
                    const workspace = await Workspace.findById(inputList.workSpaceId);
                    if (workspace) {
                        if (!workspace.Admin.includes(req.current.id)) {
                            throw errorHandle('Not authorized, only admins can add list', 400)
                        }
                        if (workspace.Boards.includes(inputList.boardId)) {
                            const lists = await Board.findById(inputList.boardId).select('Lists')
                                .populate('Lists', 'Title Transition AllowedRoles');
                            lists.Lists.forEach(i => {
                                if (i.Title == inputList.Title) {
                                    throw errorHandle('Please select another Title for list', 400)
                                }
                            })
                            let board = await Board.findById(inputList.boardId)
                            if (inputList.transition) {
                                inputList.transition.forEach(i => {
                                    if (!board.Lists.includes(i)) {
                                       throw errorHandle('Error while adding the transition of list')
                                   }
                               })
                            }
                            const list = new List({
                                Title: inputList.Title,
                                Transition: inputList.transition,
                                Creator: req.current.id,
                                Tasks: [],
                                AllowedRoles: inputList.allowedRoles
                            })
                            await list.save();
                            board = await Board.findByIdAndUpdate(
                                inputList.boardId,
                                { $push: { Lists: list._id } },
                                { new: true}
                            )
                            await board.save();
                            res.board = board;
                            res.msg = 'List added to board successfully'
                            res.status = true
                            let sockets = getIO();
                            const members = board.Users;
                            members.forEach(i => {
                                i = i.userId;
                                // console.log(i+ ' '+sockets.userSocket[i.toString()])
                                if (sockets && sockets.userSocket[i.toString()] && i.toString() != req.current.id.toString()) {
                                sockets.to(sockets.userSocket[i.toString()]).emit('addList', { baordId: board._id, board: board });
                            }
                         })
                            return res
                        }
                        const error = errorHandle('No Board found', 404);
                        throw error;
                    }
                    const error = errorHandle('No workspace found', 404);
                    throw error;
                } catch (err) {
                    throw err;
                }
            } else {
                
                return res;
            }
            
        } else {
            const error = errorHandle('Not authenticated', 400);
            throw error;
        }
    },
    removeList: async function ({ workSpaceId,listId }, req) {
        if (req.auth) {
            if (workSpaceId && listId) {
                try {
                    const workspace = await Workspace.findOne({ _id: workSpaceId, Admin: { $in: req.current.id } });
                    if (!workspace) {
                        throw errorHandle('Workspace not found or you are not an admin', 404);
                    }
                    const board = await Board.findOne({ Lists: { $in: listId } });
                    if (!board) {
                        throw errorHandle('No list by this ID', 404);
                    }
                    if (workspace.Boards.includes(board._id)) {
                        const list = await List.findById(listId).select('Tasks');
                        console.log(list)
                        if (list) {
                            await Task.deleteMany({ _id: { $in: list.Tasks } })
                            
                            await Comment.deleteMany({ Task: { $in: list.Tasks } });

                            await List.deleteOne({ _id: listId });

                            await Board.updateOne(
                                { _id: board._id },
                                { $pull: { Lists: { _id: listId } } }
                            );
                            let sockets = getIO();
                            const members = board.Users;
                            members.forEach(i => {
                                i = i.userId;
                                // console.log(i+ ' '+sockets.userSocket[i.toString()])
                                if (sockets && sockets.userSocket[i.toString()] && i.toString() != req.current.id.toString()) {
                                sockets.to(sockets.userSocket[i.toString()]).emit('removeList', { baordId: board._id, board: board });
                            }
                         })
                            return true;
                        }
                        throw errorHandle('List does not found', 404);
                    }
                    throw errorHandle('Board not found in this workspace',404);
                }
                catch (err) {
                throw err;
               }
            } 
            throw errorHandle('Missing fields', 400);
            
        }
        throw errorHandle('Not authenticated', 400);
    },
    modifyList: async function ({ inputList,lstId }, req) {
        if (req.auth) {
            if (inputList.Title && inputList.workSpaceId && inputList.boardId && lstId ) {
                try {
                    let res = ['', {}, false];
                    const workspace = await Workspace.findOne({ _id: inputList.workSpaceId }, { Admin: true, Boards: true });
                    if (!workspace) {
                        throw errorHandle('Workspace not found', 404);
                    }
                    let indx = workspace.Admin.findIndex(i => i._id == req.current.id);
                    if (indx != -1) {
                        indx = workspace.Boards.findIndex(i => i._id == inputList.boardId);
                        if (indx != -1) {
                            const board = await Board.findOne({ _id: workspace.Boards[indx] }, { Lists: true, Users: true });
                            if (board.Lists.includes(lstId)) {
                                let list = await List.findById(lstId);
                                list.Title = inputList.Title || list.Title;
                                list.Transition = inputList.transition || list.Transition
                                list.Tasks = inputList.tasks || list.Tasks
                                list.AllowedRoles = inputList.allowedRoles || list.AllowedRoles;
                                await list.save();
                                res.msg = 'List updated successfully';
                                res.lst = list
                                res.status = true
                                let sockets = getIO();
                                const members = board.Users;
                                members.forEach(i => {
                                    i = i.userId;
                                // console.log(i+ ' '+sockets.userSocket[i.toString()])
                                    if (sockets && sockets.userSocket[i.toString()] && i.toString() != req.current.id.toString()) {
                                    sockets.to(sockets.userSocket[i.toString()]).emit('modifyList', { baordId: board._id, board: board });
                            }
                         })
                                return res
                            }
                            else {
                                 throw errorHandle('List is not in this board')
                            }
                        }
                        else {
                            throw errorHandle('Error in input data, board is not in this workspace')
                        }
                    }
                    else {
                        throw errorHandle('Only admins are alowed to modify', 403);
                    }

                } catch (err) {
                    throw err
                }
            }
            else {
                throw errorHandle('There are missing fields', 400);
            }
        }
        throw errorHandle('Not authenticated', 400);
    },
    modifyBoard: async function ({ inputBoard }, req) {
        if (!req.auth) {
            throw errorHandle('Not authenticated', 400);
        }
        try {
            const workspace = await Workspace.findOne({ Boards: { $in: inputBoard.id } });
            if (workspace) {
                let adminIndx = workspace.Admin.findIndex(i => i._id == req.current.id);
                if (adminIndx != -1) {          
                    const board = await Board.findById(inputBoard.id)
                    let arr = [];
                    inputBoard.Users.forEach(i => {
                        if (!workspace.Users.includes(i.userId)) {
                            throw errorHandle(`User Id ${i.userId} is not added yet in this workspace`, 404);
                        }
                        arr.push({userId:i.userId,role:i.role });
                    })
                    board.Users = arr || board.Users;
                    // board.Lists = inputBoard.Lists || board.Lists;
                    board.Title = inputBoard.Title || board.Title;
                    board.LinkExpiryDate = inputBoard.LinkExpiryDate || board.LinkExpiryDate;
                    await board.save();
                    let res = { msg: 'Board modified successfully', board: board, status: true }
                    let sockets = getIO();
                    const members = board.Users;
                    members.forEach(i => {
                        i = i.userId;
                        // console.log(i+ ' '+sockets.userSocket[i.toString()])
                        if (sockets && sockets.userSocket[i.toString()] && i.toString() != req.current.id.toString()) {
                        sockets.to(sockets.userSocket[i.toString()]).emit('modifyBoard', { baordId: board._id, board: board });
                        }
                    })
                    return res
                }
                else {
                    throw errorHandle('Only admins can make modification', 403);
                }
            }
            else {
                throw errorHandle('Wrong input data', 404);
            }
        } catch (err) {
            throw err;
        }

    },
    // need to be tested after adding tasks
    deleteBoard: async function ({ workSpaceId, boardId }, req) {
        if (req.auth) {
            if (!(workSpaceId && boardId)) {
                throw errorHandle('Invalid input data', 400);
            }
            try {
                const workspace = await Workspace.findOne({ _id: workSpaceId, Boards: { $in: boardId } }, { Admin: 1, Users: 1 });
                if (!workspace) {
                    throw errorHandle('Workspace not found', 404);
                }
                const isAdmin = workspace.Admin.findIndex(i => i._id == req.current.id)
                
                if (isAdmin == -1) {
                    throw errorHandle('Only admins can delete boards', 403);
                }
                const board = await Board.findById(boardId, { Lists: 1 }).populate('Lists', 'Tasks');
                const tasksTobeDelete = board.Lists.Tasks;
                await Comment.deleteMany({ Task: { $in: tasksTobeDelete } });
                await Task.deleteMany({ _id: { $in: tasksTobeDelete } });
                await List.deleteMany({ _id: { $in: board } });
                await Workspace.updateOne({ _id: workSpaceId }, { $pull: { Boards: boardId } });
                await Board.deleteOne({ _id: boardId });
                let sockets = getIO();
                const members = workspace.Users;
                members.forEach(i => {
                    if (sockets && sockets.userSocket[i.toString()] && i.toString() != req.current.id.toString()) {
                        sockets.to(sockets.userSocket[i.toString()]).emit('deleteBoard', { baordId: board._id, board: board });
                }
            })
                return true;

            } catch (err) {
                throw err;
            }
        }
           
        else {
            throw errorHandle('Not authenticated', 400);
        }
    },
    addTask: async function ({ workSpaceId, boardId, listId, taskData }, req) {
        if (!req.auth) {
            throw errorHandle('Not authenticated', 400);
        }
        let input = Boolean(!workSpaceId || !boardId || !listId || !taskData.Title || !taskData.Cur_list);
        if (input==true) {
            throw errorHandle('Invalid input data', 400);
        }
        try {
            const workspace = await Workspace.findById(workSpaceId, { Admin: 1, Boards: 1, Users: 1 })
            if (!workspace) {
                throw errorHandle('Workspace not found', 404);
            }
            const isAdmin = workspace.Admin.findIndex(i => i._id == req.current.id);
            if (isAdmin != -1) {
                if (taskData.AssignedUsers) {
                    taskData.AssignedUsers.forEach(i => {
                        if (workspace.Users.findIndex(j => j._id == i) == -1) {
                            throw errorHandle(`User ${i} not in this workspace`, 400)
                        }
                    })
                }
                if (workspace.Boards.findIndex(i => i._id == boardId)==-1) {
                    throw errorHandle('Board Id is not in this current workspace', 400);
                }
                else {
                    let res = ['',{},true]
                    const board = await Board.findById(boardId, { Lists: 1 }).populate({
                        path: 'Lists',
                        select: 'Tasks',
                        populate: {
                            path: 'Tasks',
                            select: 'Title'
                        }
                    })
                    if (!board) {
                        throw errorHandle('Board not found', 404);
                    }
                    board.Lists.forEach(i => {
                            i.Tasks.forEach(j => {
                               if (j.Title == taskData.Title) {
                                    throw errorHandle('Please select another Title for the task', 400)
                               }
                            })
                    })
                    let deadlineDate = "";
                    if (taskData.Deadline) {
                        if (new Date() >= new Date(taskData.Deadline)) {
                            throw errorHandle('Deadline date should be greater than current date');
                        }
                        deadlineDate = new Date(taskData.Deadline);
                    }
                    if (board.Lists.findIndex(i => i._id == listId)!=-1) {
                        const newTask = new Task({
                            Title: taskData.Title,
                            Deadline: deadlineDate,
                            Cur_list: taskData.Cur_list,
                            AssignedUsers: taskData.AssignedUsers,
                            Description: taskData.Description
                        })

                        await newTask.save();
                                            
                        await List.updateOne({ _id: listId }, { $push: { Tasks: newTask._id } });
                        res.task = newTask;
                        res.task.Deadline = toString(taskData.Deadline)
                        res.msg = 'Task added successfully'
                        res.status = true
                        let sockets = getIO();
                        const members = board.Users;
                        members.forEach(i => {
                            i = i.userId;
                            if (sockets && sockets.userSocket[i.toString()] && i.toString() != req.current.id.toString()) {
                                sockets.to(sockets.userSocket[i.toString()]).emit('addTask', { baordId: board._id, board: board });
                        }
                    })
                        return res
                    }
                    else {
                        throw errorHandle('List Id is not in this current board', 400)
                    }
                }

            } else {
                throw errorHandle('Not authorized, only admins can add tasks', 403)
            }
        } catch (err) {
            throw err;
        }
    },
    modifyTask: async function ({ workSpaceId, boardId, moveTask, Title, Deadline, AllowedUsers, toListId, taskId}, req ) {
        if (!req.auth) {
            throw errorHandle('Not authenticated', 400);
        }
        if (!workSpaceId || !boardId || !taskId ||(moveTask!=false && moveTask!=true)) {
            throw errorHandle('Invalid input data', 400);
        }
        if (moveTask) {
            if (!toListId) {
                throw errorHandle('Invalid input data', 400);
            }
            try {
                const workspace = await Workspace.findById(workSpaceId, { Boards: 1, Admin: 1 });
                if (!workspace) {
                    throw errorHandle('Workspace not found', 404);
                }
                if (workspace.Boards.findIndex(i => i._id == boardId) == -1) {
                    throw errorHandle('Incorrect input data', 400);
                }
                const board = await Board.findById(boardId);
                let task = await Task.findById(taskId);
                if (!board || !task) {
                    throw errorHandle('Board or task not found', 404);
                }
                if (board.Lists.findIndex(i => i._id != task.Cur_list) == -1 || board.Lists.findIndex(i => i._id == toListId) == -1) {
                    throw errorHandle('These lists Ids are not in this board', 404);
                }
                if (task.Cur_list == toListId) throw errorHandle('Current list Id is similar to destination list id', 400);
                const list = await List.findById(task.Cur_list, { Transition: 1 });
                let isValidTransition = false;
                list.Transition.forEach(i => {
                    if (i == toListId) {
                        isValidTransition = true;
                    }
                })
                if (!isValidTransition) {
                    throw errorHandle('Invalid Transition', 400);
                }
                if (task.AssignedUsers.findIndex(i => i._id == req.current.id) == -1 && workspace.Admin.findIndex(i=>i._id==req.current.id)==-1) {
                    throw errorHandle('Not assigned to this task, you won\'t be able to move it', 403);
                }
                task.Cur_list = toListId;
                await task.save();
                let res = {
                    msg: "Updated successfully",
                    task: task,
                    status: true
                };
                let sockets = getIO();
                const members = board.Users;
                members.forEach(i => {
                    i = i.userId;
                    if (sockets && sockets.userSocket[i.toString()] && i.toString() != req.current.id.toString()) {
                    sockets.to(sockets.userSocket[i.toString()]).emit('modifyTask', { baordId: board._id, board: board });
                    }
                })
                return res;
            } catch (err) {
                throw err;
            }
        }
        else {
            try {
                const workspace = await Workspace.findById(workSpaceId, { Admin: 1, Boards: 1 });
                if (workspace.Admin.findIndex(i => i._id == req.current.id) == -1) {
                    throw errorHandle('Not authorized', 403);
                }
                if (workspace.Boards.findIndex(i => i._id == boardId) == -1) {
                    throw errorHandle('Incorrect board id', 404);
                }
                const board = await Board.findById(boardId, { Lists: 1 });
                const task = await Task.findById(taskId);
                if (board.Lists.indexOf(task.Cur_list)== -1) {
                    throw errorHandle('This board doesnt contain this tasK id', 404);
                }
                if (Title) task.Title = Title
                if (Deadline) {
                    task.Deadline = new Date(Deadline)
                }
                if (AllowedUsers) task.AssignedUsers = AllowedUsers
                await task.save();
                let res = {
                    msg: 'Task updated succesffully',
                    task: task,
                    status: true
                }
                let sockets = getIO();
                const members = board.Users;
                members.forEach(i => {
                    i = i.userId;
                    if (sockets && sockets.userSocket[i.toString()] && i.toString() != req.current.id.toString()) {
                    sockets.to(sockets.userSocket[i.toString()]).emit('modifyBoard', { baordId: board._id, board: board });
                    }
                })
                return res;
            } catch (err) {
                throw err;
            }
        }
       
    },
    deleteTask: async function ({ boardId, taskId }, req) {
        if (!req.auth) {
            throw errorHandle('Not authenticated', 400);
        }
        if (!board || !taskId) {
            throw errorHandle('Invalid input data', 400);
        }
        try {
            const workspace = await Workspace.findOne({ Boards: { $in: boardId } }, { Admin: 1 });
            if (!workspace) {
                throw errorHandle('Workspace not found', 404);
            }
            if (workspace.Admin.findIndex(i => i.toString == req.current.id.toString) == -1) {
                throw errorHandle('Only admins can delete this task', 403);
            }
            const board = await Board.findById(boardId);
            const task = await Task.findById(taskId);
            if (!board || task) {
                throw errorHandle('Board or task not found', 404);
            }
            const curList = task.Cur_list;
            if (board.Lists.findIndex(i => i.toString == curList.toString) == -1) {
                throw errorHandle('Task is not in this board', 404);
            }
            await Comment.deleteMany({ Task: { $in: taskId } });
            await Task.deleteOne({ _id: taskId });
            let sockets = getIO();
            const members = board.Users;
            members.forEach(i => {
                    i = i.userId;
                    if (sockets && sockets.userSocket[i.toString()] && i.toString() != req.current.id.toString()) {
                    sockets.to(sockets.userSocket[i.toString()]).emit('deleteTask', { baordId: board._id, board: board });
                    }
                })
            return true;


        } catch (err) {
            throw err;
        }
    },
    addComment: async function ({ taskId, content }, req) {
        if (req.auth) {
            if (taskId && content) {
                try {
                    const task = await Task.findById(taskId);
                    if (!task) {
                        throw errorHandle('Task not found', 404);
                    }
                    const board = await Board.findOne({ Lists: { $in: task.Cur_list } });
                    const workspace = await Workspace.findOne({ Boards: { $in: board._id } }, { Admin: 1 });
                    if (!workspace) {
                        throw errorHandle('Workspace not found', 404);
                    }
                    if (task.AssignedUsers.findIndex(i => i._id == req.current.id) != -1 || workspace.Admin.findIndex(i=>i._id.toString == req.current.id.toString)) {
                        const comment = new Comment({
                            Task: taskId,
                            Sender: req.current.id,
                            Content: content
                        })
                    await comment.save();
                    let sockets = getIO();
                    const members = task.AssignedUsers;
                    members.forEach(i => {
                        if (sockets && sockets.userSocket[i.toString()] && i.toString() != req.current.id.toString()) {
                           sockets.to(sockets.userSocket[i.toString()]).emit('modifyBoard', { baordId: board._id, board: board });
                        }
                    })
                        let res = { msg: 'Comment added successfully', task: task, status: 1 };
                        return res;
                    }
                    else {
                        throw errorHandle('Not authorized', 403);
                    }
                } catch (err) {
                    throw err;
                }
            }
            else {
                throw errorHandle('Invalid input data', 400);
            }
            
        } else {
            throw errorHandle('Not authenticated', 400);
        }
    },
    getTask: async function ({ boardId,taskId }, req) {
        if (req.auth) {
            if (!boardId && !taskId) {
                throw errorHandle('Wrong input data', 400);
            }
            if (boardId) {
                try {
                    let board = await Board.findById(boardId, { Lists: 1 });
                    if (!board) {
                        throw errorHandle('Board not found', 404);
                    }
                    let boardLists = board.Lists;
                    let tasks = await Task.find();
                    let retTasks = [];
                    tasks.forEach(j => {
                        if (boardLists.findIndex(i => i.toString == j._id.toString) != -1) {
                            retTasks.push(j);
                        }
                    })
                    return retTasks;
                } catch (err) {
                    throw err;
                }
            }
            else {
                const task = await Task.findById(taskId)
                if (!task) {
                    throw errorHandle('Task not found', 404);
                }
                return [task];
            }
        }
        throw errorHandle('Not authenticated', 400);
    }
}