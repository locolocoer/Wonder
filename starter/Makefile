CC      ?= gcc
CFLAGS  = -Wall
SRC     = src/main.c src/lexer.c src/parser.c src/codegen.c
TARGET  = mycc

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $(TARGET) $(SRC)

clean:
	rm -f $(TARGET) $(TARGET).exe

.PHONY: all clean
