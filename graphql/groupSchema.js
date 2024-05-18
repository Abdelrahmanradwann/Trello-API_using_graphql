const { buildSchema } = require('graphql')



// Manage users in workspace
// add, remove
module.exports = buildSchema(`

    input inputBoard {
        Creator: String!
        Title: String!
    }

    type outputBoard {
        _id: String
        Title: String!
        Creator: String!
    }

    type rootQuery {
        _root: String!
    }

    type rootMutation {
        addUser(userId: String!, workSpaceId: String!, usingLink: Boolean!):String!
        removeUser(userId: String!, workSpaceId: String!): String!
        createBoard(inputData: inputBoard!, workspaceId: String!): outputBoard!
    }

    schema {
        query: rootQuery
        mutation: rootMutation
    }

`)