import logging
import psycopg2
import traceback
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Updater, CommandHandler, CallbackQueryHandler, CallbackContext
TOKEN = "5904913646:AAFgHOZ_FIusU4sYsNq9avDxy7LUIIMnjz4"
# Enable logging
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

# Create and connect to the PostgreSQL database
db_config = {   
    'dbname': 'postgres',
    'user': 'admin',
    'password': 'admin',
    'host': 'localhost'
}
# charging_stations = [
    

    # {'id': 1, 'name': 'Точка "Ауэзова 24"', 'latitude': 42.862041, 'longitude': 74.690613, 'available': True},
    # {'id': 2, 'name': 'Точка "Анкара 1/16/1"', 'latitude': 42.856616, 'longitude': 74.671603, 'available': False},
    # {'id': 3, 'name': 'Точка "Муромская"', 'latitude': 42.851215, 'longitude': 74.54596, 'available': True},
    # {'id': 4, 'name': 'Точка "Киевская, Парковка ТЦ Beta Stores"','latitude': 42.875316, 'longitude': 74.592701, 'available': True},
    # {'id': 5, 'name': 'Точка "Бизнес-центр 79"', 'latitude': 42.874330, 'longitude': 74.591650, 'available': False}
# ]


conn = psycopg2.connect(**db_config)
cursor = conn.cursor()



def create_tables():
    # Create the charging_stations table if it doesn't exist
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS charging_stations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        available BOOLEAN NOT NULL
    )
    ''')
    conn.commit()

create_tables()

def insert_charging_stations_to_db(cursor):
    cursor.execute("SELECT COUNT(*) FROM charging_stations")
    count = cursor.fetchone()[0]
    
    print(f"Number of records in the charging_stations table: {count}")

    if count == 0:
        charging_stations = [
            # ... (charging station data)
        ]

        for station in charging_stations:
            cursor.execute(
                "INSERT INTO charging_stations (id, name, latitude, longitude, available) VALUES (%s, %s, %s, %s, %s)",
                (station['id'], station['name'], station['latitude'], station['longitude'], station['available'])
            )
            print(f"Inserted station {station['id']}: {station['name']}")

        # Commit the transaction
        conn.commit()

# Reserve station function
def reserve_station(update: Update, context: CallbackContext, station_id):
    query = update.callback_query
    query.answer()

    # Update the reservation status in the database
    cursor.execute('UPDATE charging_stations SET available = FALSE WHERE id = %s', (station_id,))
    conn.commit()

    query.edit_message_text(f"Station {station_id} reserved successfully.")

def show_stations(update: Update, context: CallbackContext, available: bool):
    query = update.callback_query
    query.answer()

    # Get available/unavailable charging stations from the database
    cursor.execute('SELECT id, name FROM charging_stations WHERE available = %s', (available,))
    stations = cursor.fetchall()

    if not stations:
        text = "No available stations found." if available else "No unavailable stations found."
        query.edit_message_text(text)
        return

    buttons = []
    for station in stations:
        buttons.append([InlineKeyboardButton(f'{station[1]} (ID: {station[0]})', callback_data=f'reserve_{station[0]}')])

    reply_markup = InlineKeyboardMarkup(buttons)
    query.edit_message_text("Select a station to reserve:", reply_markup=reply_markup)
# Other functions like start, main_menu, locations, stations, personal_info, send_locations, show_personal_info, error
def start(update: Update, context: CallbackContext):
    update.message.reply_text("Welcome to the Charging Station Bot!",
                              reply_markup=main_menu_keyboard())


def main_menu(update: Update, context: CallbackContext):
    query = update.callback_query
    query.answer()
    query.edit_message_text("Main Menu", reply_markup=main_menu_keyboard())


def locations(update: Update, context: CallbackContext):
    query = update.callback_query
    query.answer()
    query.edit_message_text("Locations Menu", reply_markup=locations_keyboard())


def stations(update: Update, context: CallbackContext):
    query = update.callback_query
    query.answer()
    query.edit_message_text("Stations Menu", reply_markup=stations_keyboard())


def personal_info(update: Update, context: CallbackContext):
    query = update.callback_query
    query.answer()
    query.edit_message_text("Personal Info Menu", reply_markup=personal_info_keyboard())


def main_menu_keyboard():
    keyboard = [
        [InlineKeyboardButton("Locations", callback_data="locations")],
        [InlineKeyboardButton("Stations", callback_data="stations")],
        [InlineKeyboardButton("Personal Info", callback_data="personal_info")]
    ]
    return InlineKeyboardMarkup(keyboard)


def locations_keyboard():
    keyboard = [
        [InlineKeyboardButton("Send Locations", callback_data="send_locations")],
        [InlineKeyboardButton("Back", callback_data="main_menu")]
    ]
    return InlineKeyboardMarkup(keyboard)


def stations_keyboard():
    keyboard = [
        [InlineKeyboardButton("Show Available Stations", callback_data="available_stations")],
        [InlineKeyboardButton("Show Unavailable Stations", callback_data="unavailable_stations")],
        [InlineKeyboardButton("Back", callback_data="main_menu")]
    ]
    return InlineKeyboardMarkup(keyboard)


def personal_info_keyboard():
    keyboard = [
        [InlineKeyboardButton("Car Type", callback_data="car_type")],
        [InlineKeyboardButton("Total Spent", callback_data="total_spent")],
        [InlineKeyboardButton("Back", callback_data="main_menu")]
    ]
    return InlineKeyboardMarkup(keyboard)


def send_locations(update: Update, context: CallbackContext): #TEST
    query = update.callback_query
    query.answer()

    # cursor.execute("SELECT id, name, latitude, longitude FROM charging_stations WHERE available = %s", (show_stations,))
    # stations = cursor.fetchall()

    # if not stations:
    #     query.edit_message_text("No stations found.")
    # else:
    #     station = stations[0]
    #     info_text = f"{station[1]} ({station[2]}, {station[3]})"
    #     query.edit_message_text(info_text, reply_markup=locations_keyboard(station, available))
    # Send charging station locations
    # ...


def show_personal_info(update: Update, context: CallbackContext, info_type: str):
    query = update.callback_query
    query.answer()

    if info_type == 'car_type':
        # Get and show car type information
        # ...
        pass
    elif info_type == 'total_spent':
        # Get and show total spent information
        # ...
        pass


def error(update: Update, context: CallbackContext):
    logger.warning('Update "%s" caused error "%s"', update, context.error)
# ...

def main():
    updater = Updater(TOKEN, use_context=True)

    dp = updater.dispatcher

    dp.add_handler(CommandHandler("start", start))
    dp.add_handler(CallbackQueryHandler(main_menu, pattern='main_menu'))
    dp.add_handler(CallbackQueryHandler(locations, pattern='locations'))
    dp.add_handler(CallbackQueryHandler(stations, pattern='stations'))
    dp.add_handler(CallbackQueryHandler(personal_info, pattern='personal_info'))
    dp.add_handler(CallbackQueryHandler(send_locations, pattern='send_locations'))
    dp.add_handler(CallbackQueryHandler(lambda u, c: show_stations(u, c, True), pattern='available_stations'))
    dp.add_handler(CallbackQueryHandler(lambda u, c: show_stations(u, c, False), pattern='unavailable_stations'))
    dp.add_handler(CallbackQueryHandler(lambda u, c: show_personal_info(u, c, 'car_type'), pattern='car_type'))
    dp.add_handler(CallbackQueryHandler(lambda u, c: show_personal_info(u, c, 'total_spent'), pattern='total_spent'))

    # Get the charging stations from the database
    cursor.execute('SELECT id, name, latitude, longitude, available FROM charging_stations')
    charging_stations = cursor.fetchall()

    # Reserve station handlers
    for station in charging_stations:
        station_id = station[0]
        dp.add_handler(CallbackQueryHandler(lambda u, c, s=station_id: reserve_station(u, c, s), pattern=f'reserve_{station_id}'))

    dp.add_error_handler(error)

    updater.start_polling()
    updater.idle()
    logger.debug("Starting the bot...")  # Add this line to log a message when the bot starts
  



if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"An error occurred: {e}")
        traceback.print_exc()