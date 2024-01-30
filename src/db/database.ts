import mongoose, { HydratedDocument, connect, model } from "mongoose";
import { isEmail } from "validator";
import { config } from "dotenv";
config();

// defining the type (shape) of the env variables
type EnvVariables = {
  MONGO_URI: string;
};

// creating an interface representing a document in MongoDB
interface User {
  _id: string;
  email: string;
  password: string;
  description?: string | undefined;
  duration?: number | undefined;
  date?: string | undefined;
}

interface Exercise {
  _id: string;
  email?: User["email"];
  description?: string | undefined;
  duration?: number | undefined;
  date?: string | undefined;
}

interface ExerciseDetails {
  description?: string;
  duration?: number;
  date?: string;
}

interface FetchExerciseLogsResult {
  email: string;
  count: number;
  _id: User["_id"];
  log: ExerciseLog | string;
}

type ExerciseLog = ExerciseDetails[] | undefined;

// create a schema corresponding to the document (rows) interface
const UserSchema = new mongoose.Schema<User>(
  {
    email: {
      type: String,
      required: [true, "Please enter your email address"],
      unique: true,
      lowercase: true,
      validate: [isEmail, "Invalid email"],
    },
    password: {
      type: String,
      required: [true, "Please enter a password"],
      minlength: [8, "Minimum password length is 8 characters"],
    },
    date: { type: String, required: false },
    description: { type: String, required: false },
    duration: { type: Number, required: false },
  },
  { versionKey: false },
);

// fire a function after doc saved to db - post is not to do with the http request - means post saving doc
UserSchema.post("save", function (doc, next) {
  console.log("new user created and saved:", doc);
  next();
});

// fire a function before doc saved to db
UserSchema.pre("save", function (next) {
  console.log("user about to be created and saved", this);
  next();
});

const ExerciseSchema = new mongoose.Schema<Exercise>(
  {
    email: { type: String, required: true },
    description: { type: String, required: true },
    duration: { type: Number, required: true },
    date: { type: String, required: false },
  },
  { versionKey: false },
);

// create a model - this allows you to create instances of your objects, called documents
const UserModel = model<User>("User", UserSchema);
const ExerciseModel = model<Exercise>("Exercise", ExerciseSchema);

// connecting to mongoDB
connect((process.env as EnvVariables).MONGO_URI);

// checking if email is already in db
export const createOrSaveUsernameToDb = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  // if it is, return that that user object to the user
  const foundUser = await UserModel.findOne({ email, password });
  let savedUser: User;
  if (foundUser) {
    savedUser = foundUser;
    return savedUser;
  }
  // otherwise, creating a new instance of a user and saving to db
  else {
    const newUser: HydratedDocument<User> = new UserModel({ email, password });
    const currentObjId = newUser._id;
    const newObjIdString = currentObjId.toString();
    savedUser = await newUser.save();
    const foundNewlySavedUser = await UserModel.findOne({
      email,
      _id: newObjIdString,
    });
    return foundNewlySavedUser;
  }
};

// returning a list of all saved users
export const fetchAllUsers = async () => {
  const fetchedUsers: User[] = await UserModel.find();
  return fetchedUsers;
};

// adding and saving exercises data based on user ID
export const createAndSaveExerciseToDb = async (
  userId: string,
  description: string,
  durationNum: number,
  date: string,
) => {
  const dateToUse = date ? new Date(date) : new Date();
  const exerciseDetails: ExerciseDetails = {
    description: description,
    duration: durationNum,
    date: dateToUse.toISOString(),
  };

  // finding the user object by their ID
  const newId = new mongoose.Types.ObjectId(userId);
  const user: User | null = await UserModel.findById(newId);

  if (user) {
    user.description = exerciseDetails.description;
    user.duration = exerciseDetails.duration;
    user.date = dateToUse.toDateString();

    const exerciseObjAndUsername = new ExerciseModel({
      email: user.email,
      ...exerciseDetails,
    });
    await exerciseObjAndUsername.save();
    return user;
  } else {
    console.log(`User ${userId} was not found`);
    return;
  }
};

export const fetchExerciseLogs = async (
  userId: string,
  from?: string,
  to?: string,
  limit?: string,
): Promise<FetchExerciseLogsResult | undefined> => {
  const foundId: User | null = await UserModel.findById(userId);

  // using email to find exercises associated with it
  const exerciseQuery: mongoose.FilterQuery<Exercise> = {};
  if (foundId) {
    exerciseQuery.email = foundId.email;
  }

  // if there are request queries for date, add those to the query object
  if (from && to) {
    const fromDateUTCString = new Date(from).toISOString();
    const toDateUTCString = new Date(to).toISOString();
    exerciseQuery.date = { $gte: fromDateUTCString, $lte: toDateUTCString };
  }

  // if there is a limit query, change it to a number
  let limitNumber: number = 9999;
  if (limit) {
    limitNumber = parseFloat(limit);
  }

  // find all exercises in the db that match the email and any date and/or limit queries
  const foundExercises = await ExerciseModel.find(exerciseQuery)
    .limit(limitNumber)
    .exec();

  // map through all found exercises to return only the description, date and duration properties
  const logArray: ExerciseDetails[] | undefined = foundExercises.map(
    (exercise) => {
      const dateObj = exercise.date ? new Date(exercise.date) : undefined;
      return {
        description: exercise.description,
        duration: exercise.duration,
        date: dateObj?.toDateString(),
      };
    },
  );

  const numOfExercises: number = logArray.length;

  //  creating log repsonse object
  const exerciseLog: FetchExerciseLogsResult = {
    email: foundExercises[0]?.email || "no email found",
    count: numOfExercises,
    _id: userId,
    log: logArray.length > 0 ? logArray : [],
  };
  return exerciseLog;
};
