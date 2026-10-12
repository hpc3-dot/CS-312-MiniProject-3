import express from "express";
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";



const db = new pg.Client({
  user: 'postgres',
  host: 'Localhost',
  database: 'BlogDB',
  password: 'H!856632hh',
  port: 5432
});

const port = 3000;
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const blogPosts = [];
const apiKey = '2a061e0ba695c33d698a9ab739160622';
let weatherReport;
let geocodeData;

db.connect();
app.use('/public', express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  sameSite: 'lax',
  cookie: { secure: false ,
    maxAge: 24 * 60 * 60 * 1000
  }
}));
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://localhost:${port}`);
});

app.get('/', (req, res) => {
  res.render('login.ejs');
});

app.post('/register', async(req, res) => {
  console.log(req.body);
  const saltRounds = 10;
  if (req.body.password !== req.body.confirmPassword) {
    return res.status(500).render('login.ejs', {registered: false, error: true});
  }
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);
    await db.query('INSERT INTO users (fullName, email, bio, username, password) Values ($1,$2,$3,$4,$5)', [req.body.fullName, req.body.email, req.body.bio, req.body.username, hashedPassword], (err, result) => {
      if (err) {
        console.error('Error inserting user:', err);
           return res.status(500).render('login.ejs', {registered: false, error: true});
      }
       return res.render('login.ejs', {registered: true, error: false});
    });
}
catch (error) {
    console.error('Error hashing password:', error);
    return res.status(500).render('login.ejs', {registered: false, error: true});
  }

});
app.get('/account', async(req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  try{
  const result = await db.query('SELECT * FROM users WHERE id = $1', [req.session.userId], (err, result) => {
    if (err) {
      console.error('Error fetching user:', err);
      return res.status(500).render('account.ejs', {registered: false, error: true});
    }
    res.render('account.ejs', { fullName: result.rows[0].fullname, email: result.rows[0].email, bio: result.rows[0].bio, username: result.rows[0].username });

  });}
  catch (error) {
    console.error('Error fetching user:', error);
    return res.status(500).render('account.ejs', {registered: false, error: true});
  }
  
});
app.post('/updateAccount', async (req, res) => {
  try {
    await db.query('UPDATE users SET fullName = $1, email = $2, bio = $3, username = $4 WHERE id = $5', [req.body.fullName, req.body.email, req.body.bio, req.body.username, req.session.userId], (err, result) => {
      if (err) {
        console.error('Error updating user:', err);
           return res.status(500).render('account.ejs', {registered: false, error: true});
      }
       return res.redirect('/home');
    });
}
catch (error) {
    console.error('Error hashing password:', error);
    return res.status(500).render('account.ejs');
  }
});
app.post('/changePassword', async (req, res) => {
  try {
    if (req.body.newPassword !== req.body.confirmNewPassword) {
      return res.status(400).render('account.ejs');
    }
    const hashedPassword = await bcrypt.hash(req.body.newPassword, 10);
    await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, req.session.userId]);
      
      return res.redirect('/home');
  
  } catch (error) {
    console.error('Error hashing password:', error);
    return res.status(500).render('account.ejs');
  }
}); 
app.post('/deleteAccount', async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = $1', [req.session.userId]);
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
          return res.status(500).send('Error occurred while deleting account.');
        }
        res.redirect('/');
      });
    
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).render('account.ejs', {registered: false, error: true});
  }
});
app.post('/login', async (req, res) => {
  try {
    const users = await db.query('SELECT * FROM users WHERE username = $1', [req.body.username]);
    if (users.rows.length === 0) {
      return res.status(401).render('login.ejs', {registered: false, error: false, loginError: true});
    }
      const user = users.rows[0];
    const passwordMatch = await bcrypt.compare(req.body.password, user.password);
    if (!passwordMatch) {
      return res.status(401).render('login.ejs', {registered: false, error: false, loginError: true}); 
      
    }
  
  req.session.regenerate((err) => {
    if (err) {
      console.error('Error regenerating session:', err);
      return res.status(500).render('login.ejs', {registered: false, error: false, loginError: true});
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.fullName = user.fullname;
    req.session.edit = false;
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session:', err);
        return res.status(500).render('login.ejs', {registered: false, error: false, loginError: true});
      }
      
      res.redirect('/home');
    });
  }); 
} catch (error) {
    console.error('Error during login:', error);
    res.status(500).render('login.ejs', {registered: false, error: false, loginError: true});
  }

 });

app.get('/home', async (req, res) => {
  const fishType = req.query.fishType;
  const zipCode = req.session.zipCode || '86004'; 
  let result;
  
  try{
    if (fishType === 'userPosts') 
      {result = await db.query(`SELECT * FROM blogs WHERE creator_user_id = $1 ORDER BY date_created DESC`,[req.session.userId]);
    } else if (fishType && fishType !== 'all') 
      {result = await db.query(`SELECT * FROM blogs WHERE fish_type = $1 ORDER BY date_created DESC`,[fishType]);
    } else { result = await db.query('SELECT * FROM blogs ORDER BY date_created DESC');
    }
    await getWeather(zipCode);
    res.render('index.ejs', { blogposts: result.rows, weather: weatherReport, location: geocodeData, edit: req.session.edit, editPostId: req.session.editPostId });  
  }
  catch (error){
    console.error('Error fetching weather data:', error);
    res.status(500).send('Error fetching weather data');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Error occurred while logging out.');
    }
    res.redirect('/');
  });
});

app.post('/weather', async (req,res) =>{
  try {
    const zipCode = req.body.zipCode;
    req.session.zipCode = zipCode;
    res.redirect('/home');
  } catch(error){
    console.log('weather not found')
    console.log(error.response?.data || error.message);
  }
});

app.post('/submit', (req, res) => {
  
    db.query('Insert into blogs (creator_name, creator_user_id, title, body, fish_type, date_created) VALUES ($1, $2, $3, $4, $5, $6)',
    [req.session.username, req.session.userId, req.body.title, req.body.body, req.body.fish_type, new Date().toLocaleString()],
     (error, result) => {
        if (error) {
          console.error('Error inserting blog post:', error);
          return res.status(500).send('Failed to submit blog post.');
        }

        res.redirect('/home');
      }
    );
});

app.post('/edit', async (req, res) => {
  try {
      if (String(req.session.userId) === String(req.body.creator_user_id)) {
        req.session.edit = true;
        req.session.editPostId = Number(req.body.id);
    } else {
        return res.redirect('/home?error=unauthorized');
    }
  }
   catch (error) {
    console.error('Error fetching blog post:', error);
  }

  res.redirect('/home');
});

app.post('/updatePost', (req, res) => {
  console.log('update reached');
  db.query('UPDATE blogs SET title = $1, body = $2, fish_type = $3 WHERE blog_id = $4', 
  [req.body.postTitle, req.body.postContent, req.body.fish_type, req.body.id], (error, result) => {
    });
  req.session.edit = false;
  res.redirect('/home')
 
});

app.post('/delete', (req, res) =>{
  try{
    if (String(req.session.userId) === String(req.body.creator_user_id)) {
       db.query('DELETE FROM blogs WHERE blog_id = $1', [req.body.id], (error, result) => {
        if (error) {
          console.error('Error deleting blog post:', error);
        return res.status(500).send('Failed to delete blog post.');
        }
      });
    }
  }
  catch (error) {
    console.error('Error deleting blog post:', error);
  }
    res.redirect("/home");

});

app.post('/cancel', (req, res) => {
  req.session.edit = false;
  res.redirect('/home')
 
});



async function getLongLat(zipCode){
  try {
    const countryCode = 'US';
    const geocodeUrl = `http://api.openweathermap.org/geo/1.0/zip?zip=${zipCode},${countryCode}&appid=${apiKey}`
    const geocodeResponse = await axios.get(geocodeUrl);
    geocodeData = geocodeResponse.data;
    return geocodeResponse.data;
  }
    catch (error){
      console.error('Location not found');
      console.log(error.response?.data || error.message);
    }
  
}

async function getWeather(zipCode){
  try {
    const coords = await getLongLat(zipCode);
    const weatherUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${coords.lat}&lon=${coords.lon}&units=imperial&exclude=hourly,minutely&appid=${apiKey}`;
    const weatherResponse = await axios.get(weatherUrl);
    weatherReport = weatherResponse.data;
  }
  catch(error){
    console.log('weather not found')
    console.log(error.response?.data || error.message);
  }
}