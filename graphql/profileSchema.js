const { buildSchema } = require('graphql');

module.exports = buildSchema(`

    input inputWorkSpaceData {
        User: [String]
        Board: [String]
        Title: String!
        Admin: String!
        isPublic: Boolean
    }

    type User {
        Username: String!
        Email: String!
    }

    type returnWorkSpace {
        _id: ID!
        Title: String!
        Admin: [ID!]
        Users: [User!]
        Creator: User
        isPublic: Boolean
        Board: [String]
    }

    type Board {
        _id: String!
        lists: [String!]
        tasks: [String!]
        Creator: String!
        Title: String!
    }

    type workspaceResponse {
        msg: String!
        ws: [returnWorkSpace]
        status: Boolean!
    }

    type rootQuery {
        enterWorkSpace(id:String!): workspaceResponse!
        chooseBoard(id:String!): Board
        searchBoard(boardName:String!,workSpaceId:String!): [Board!]
        getWorkSpace: workspaceResponse
    }


    type rootMutation {
        createWorkSpace(inputData: inputWorkSpaceData!) : workspaceResponse
    }

    schema {
        query: rootQuery
        mutation: rootMutation
    }



`)