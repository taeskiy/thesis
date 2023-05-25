require('dotenv').config();
const mysql = require('mysql');
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const localSession = new LocalSession({ database: 'session_db.json' });

bot.use(localSession.middleware());

const pool = mysql.createPool({
  host: 'narynivq.beget.tech',
  user: 'narynivq_evion',
  password: 'Qwerty123',
  database: 'narynivq_evion',
});

const itemsPerRow = 3;
const itemsPerPage = 3;

function chunkArray(arr, chunkSize) {
  const result = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

function getLocationMenuButtons(page) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        reject(err);
        return;
      }

      connection.query('SELECT * FROM ChargingStations', (error, results) => {
        connection.release();
        if (error) {
          reject(error);
          return;
        }

        const startIndex = page * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const slicedLocations = results.slice(startIndex, endIndex);

        const locationButtons = chunkArray(
          slicedLocations.map((location) => [
            Markup.button.callback(location.name, `location_${location.station_id}`)
          ]),
          itemsPerRow
        );

        const navigationButtons = [];

        if (page > 0) {
          navigationButtons.push(Markup.button.callback('Предыдущие станции ⏪', 'previous'));
        }

        if (endIndex < results.length) {
          navigationButtons.push(Markup.button.callback('Ещё станции ⏩', 'next'));
        }

        resolve([
          ...locationButtons.flat(),
          navigationButtons,
          [Markup.button.callback('Главное меню 📲', 'main_menu')],
        ]);
      });
    });
  });
}

function showMainMenu(ctx) {
  ctx.reply('Главное меню:', {
    reply_markup: {
      keyboard: [
        ['Локации 🗺️'],
        ['Контакты ☎️'],
        ['Режим работы 🕑'],
        ['Забронировать'],
      ],
      resize_keyboard: true,
    },
  });
}

function showLocationMenu(ctx, page) {
  getLocationMenuButtons(page)
    .then((buttons) => {
      const replyMarkup = {
        inline_keyboard: buttons,
      };

      if (ctx.update.callback_query) {
        ctx.editMessageReplyMarkup(replyMarkup)
          .catch((err) => {
            if (err.response.description !== 'Bad Request: message is not modified') {
              console.error(err);
            }
          });
      } else {
        ctx.reply('Выберите локацию:', { reply_markup: replyMarkup });
      }
    })
    .catch((err) => {
      console.error(err);
      ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    });
}

function showReservationMenu(ctx) {
  const buttons = [
    [Markup.button.callback('Показать доступные станции', 'show_stations')],
    [Markup.button.callback('Создать бронирование', 'create_reservation')],
    // Add more buttons as needed
  ];

  ctx.reply('Меню бронирования:', {
    reply_markup: {
      inline_keyboard: buttons,
    },
  });
}

bot.command('start', (ctx) => {
  showMainMenu(ctx);
});

bot.on('text', (ctx) => {
  const text = ctx.message.text;

  if (text === 'Локации 🗺️') {
    ctx.session.page = 0;
    showLocationMenu(ctx, 0);
  } else if (text === 'Главное меню 📲') {
    showMainMenu(ctx);
  } else if (text === 'Контакты ☎️') {
    ctx.reply('Контакты:\n\n+996 (500) 333-351\nevionkg@gmail.com\nhttps://evion.kg/about');
  } else if (text === 'Режим работы 🕑') {
    ctx.reply('11:00 до 23:00\nс 11:00 до 01:00 пт-сб\n\nПодробнее тут: https://evion.kg');
  } else if (text === 'Забронировать') {
    showReservationMenu(ctx);
  }
});

bot.action(/location_(.+)/, (ctx) => {
  const locationId = ctx.match[1];

  pool.getConnection((err, connection) => {
    if (err) {
      console.error(err);
      ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
      return;
    }

    connection.query('SELECT * FROM ChargingStations WHERE station_id = ?', [locationId], (error, results) => {
      connection.release();
      if (error) {
        console.error(error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
        return;
      }

      if (results.length === 0) {
        ctx.reply('Выбранная локация не найдена.');
        return;
      }

      const location = results[0];
      ctx.reply(`Выбранная локация: ${location.name}`)
        .then(() => {
          ctx.telegram.sendLocation(ctx.chat.id, location.latitude, location.longitude);
          showLocationMenu(ctx, ctx.session.page);
        })
        .catch((err) => {
          console.error(err);
          ctx.reply('Произошла ошибка при отправке локации. Пожалуйста, попробуйте позже.');
        });
    });
  });
});

bot.action('show_stations', (ctx) => {
  // Fetch and display the available stations
  pool.getConnection((err, connection) => {
    if (err) {
      console.error(err);
      ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
      return;
    }

    connection.query('SELECT * FROM ChargingStations WHERE station_id NOT IN (SELECT DISTINCT charger_id FROM ChargeHistory)', (error, results) => {
      connection.release();
      if (error) {
        console.error(error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
        return;
      }

      if (results.length === 0) {
        ctx.reply('В данный момент нет доступных станций.');
        return;
      }

      const stationNames = results.map((station) => station.name).join('\n');
      ctx.reply(`Доступные станции:\n${stationNames}`);
    });
  });
});

bot.action('create_reservation', (ctx) => {
  // Handle create reservation logic here
  ctx.reply('Функция создания бронирования будет доступна в ближайшем будущем!');
});

bot.action('previous', (ctx) => {
  const currentPage = ctx.session.page || 0;
  const newPage = Math.max(currentPage - 1, 0);
  ctx.session.page = newPage;
  showLocationMenu(ctx, newPage);
});

bot.action('next', (ctx) => {
  const currentPage = ctx.session.page || 0;
  const newPage = currentPage + 1;
  ctx.session.page = newPage;
  showLocationMenu(ctx, newPage);
});

bot.action('main_menu', (ctx) => {
  showMainMenu(ctx);
});

bot.command('location', (ctx) => {
    ctx.session.page = 0;
    showLocationMenu(ctx, ctx.session.page);
  });
bot.launch();

console.log('Бот для локаций с помощью Telegraf и меню запущен...')
