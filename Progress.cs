namespace TopHat
{
    using System;

    class Progress
    {
        DateTime start;

        public Progress()
        {
            start = DateTime.Now;
        }

        public void ShowTick(int itemNow, int itemTotal)
        {
            // now/total,x left,x/s

            Console.Write("{0:d}/{1:d},{2:d} left", itemNow, itemTotal, itemTotal - itemNow);

            TimeSpan timeSofar = DateTime.Now - start;
            if (timeSofar != TimeSpan.Zero)
            {
                double itemsPerSec = itemNow / timeSofar.TotalSeconds;
                if (itemsPerSec > 1 || itemsPerSec == 0)
                    Console.Write(",{0:f1}/s", itemsPerSec);
                else
                    Console.Write(",{0:c}/item", TimeSpan.FromSeconds(1 / itemsPerSec));
            }

            Console.Write("  ");

            double? frac = null;
            if (itemTotal != 0)
                frac = itemNow / (double)itemTotal;
            else if (itemNow == 0)
                frac = 0;

            if (frac.HasValue)
            {
                Console.Write("{0:p1},{1:p1} left", frac, 1 - frac);

                if (timeSofar != TimeSpan.Zero)
                {
                    double percPerSec = 100.0 * frac.Value / timeSofar.TotalSeconds;
                    if (percPerSec > 1 || percPerSec == 0)
                        Console.Write(",{0:f1}%/s", percPerSec);
                    else
                        Console.Write(",{0:c}/%", TimeSpan.FromSeconds(1 / percPerSec));
                }
            }

            Console.Write("  {0:c}", timeSofar);
            if (itemNow != 0)
            {
                TimeSpan totalTime = TimeSpan.FromSeconds(timeSofar.TotalSeconds * itemTotal / itemNow);
                Console.Write("/{0:c},{1:c} left", totalTime, totalTime - timeSofar);
            }

            Console.Write("    \r");
            Console.Out.Flush();
        }
    }
}
