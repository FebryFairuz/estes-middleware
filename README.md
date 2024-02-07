#Starting Project
`npm init`

#Create orm:
`npx sequelize-cli init`

#Create Migrations:
`npx sequelize-cli model:generate --name User --attributes firstName:string,lastName:string,email:string`

#Running Migrations:
`npx sequelize-cli db:migrate`

#Running Server:
`nodemon index`
